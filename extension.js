/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ANIMATION_TIME = 220;
const MIN_SCALE_PER_LAYER = 0.045;
const MAX_SCALE_PER_LAYER = 0.085;
const MAGNETIC_OVERLAP_RATIO = 0.42;
const CYLINDER_SWITCHER_VISIBLE_SIDE_WINDOWS = 2;
const CYLINDER_SWITCHER_SIDE_STEP_RATIO = 0.2;
const CYLINDER_SWITCHER_DEPTH_RATIO = 0.35;
const CYLINDER_SWITCHER_RELEASE_DELAY = 90;
const SWITCHER_BINDINGS = new Set([
    'switch-applications',
    'switch-applications-backward',
    'switch-group',
    'switch-group-backward',
    'switch-windows',
    'switch-windows-backward',
    'cycle-windows',
    'cycle-windows-backward',
    'cycle-group',
    'cycle-group-backward',
]);
const WINDOW_TYPES = new Set([
    Meta.WindowType.NORMAL,
]);
const ABOVE_LAYER_WINDOW_TYPES = new Set([
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.UTILITY,
]);

export default class Dkst3DWinsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._signals = [];
        this._windowSignals = new Map();
        this._focusHistory = [];
        this._trackedActors = new Set();
        this._applyId = 0;
        this._cylinderSwitcherActive = false;
        this._cylinderSwitcherReleaseId = 0;
        this._cylinderSwitcherKeybindingsPatched = false;
        this._cylinderSwitcherGrab = null;
        this._cylinderSwitcherActor = null;
        this._cylinderSwitcherWindows = [];
        this._cylinderSwitcherSelectedIndex = 0;
        this._cylinderSwitcherModifierMask = 0;

        this._connect(global.display, 'notify::focus-window', () => {
            this._rememberFocusedWindow();
            this._queueApply();
        });
        this._connect(global.display, 'window-created', (_display, window) => {
            this._rememberWindow(window);
            this._queueApply();
        });
        this._connect(global.workspace_manager, 'active-workspace-changed', () => {
            this._rebuildHistory();
            this._queueApply();
        });
        this._connect(this._settings, 'changed', () => this._queueApply());
        this._patchWindowSwitcherKeybindings();

        this._rebuildHistory();
        this._queueApply();
    }

    disable() {
        if (this._applyId) {
            GLib.source_remove(this._applyId);
            this._applyId = 0;
        }

        if (this._cylinderSwitcherReleaseId) {
            GLib.source_remove(this._cylinderSwitcherReleaseId);
            this._cylinderSwitcherReleaseId = 0;
        }

        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];

        for (const [window, ids] of this._windowSignals) {
            for (const id of ids)
                window.disconnect(id);
        }
        this._windowSignals.clear();

        for (const actor of this._trackedActors)
            this._resetActor(actor, true);

        this._unpatchWindowSwitcherKeybindings();
        this._destroyCylinderSwitcherActor();

        this._trackedActors.clear();
        this._focusHistory = [];
        this._cylinderSwitcherActive = false;
        this._cylinderSwitcherWindows = [];
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _queueApply() {
        if (this._applyId)
            return;

        this._applyId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._applyId = 0;
            this._applyDepthLayout();
            return GLib.SOURCE_REMOVE;
        });
    }

    _patchWindowSwitcherKeybindings() {
        if (!Main.wm || !Main.wm.setCustomKeybindingHandler ||
            Main.wm._dkst3DWinsCylinderKeybindingsPatched)
            return;

        const extension = this;

        for (const bindingName of SWITCHER_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(
                bindingName,
                Shell.ActionMode.NORMAL,
                (...args) => {
                    const binding = args[args.length - 1];
                    const name = binding?.get_name?.();

                    if (name && SWITCHER_BINDINGS.has(name) &&
                        extension._settings?.get_boolean('use-cylinder-switcher')) {
                        extension._startCylinderSwitcher(binding);
                        return;
                    }

                    Main.wm._startSwitcher.call(Main.wm, ...args);
                });
        }

        Main.wm._dkst3DWinsCylinderKeybindingsPatched = true;
        this._cylinderSwitcherKeybindingsPatched = true;
    }

    _unpatchWindowSwitcherKeybindings() {
        if (!Main.wm || !Main.wm.setCustomKeybindingHandler ||
            !this._cylinderSwitcherKeybindingsPatched)
            return;

        for (const bindingName of SWITCHER_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(
                bindingName,
                Shell.ActionMode.NORMAL,
                Main.wm._startSwitcher.bind(Main.wm));
        }

        delete Main.wm._dkst3DWinsCylinderKeybindingsPatched;
        this._cylinderSwitcherKeybindingsPatched = false;
    }

    _startCylinderSwitcher(binding) {
        if (this._cylinderSwitcherReleaseId) {
            GLib.source_remove(this._cylinderSwitcherReleaseId);
            this._cylinderSwitcherReleaseId = 0;
        }

        if (!this._cylinderSwitcherActive) {
            this._rebuildCylinderSwitcherWindows();
            if (this._cylinderSwitcherWindows.length < 2)
                return;

            this._cylinderSwitcherActive = true;
            this._cylinderSwitcherSelectedIndex = 0;
            this._cylinderSwitcherModifierMask = this._primaryModifier(binding.get_mask());
            this._createCylinderSwitcherActor();
        }

        this._cycleCylinderSwitcher(this._getBindingDirection(binding));
    }

    _rebuildCylinderSwitcherWindows() {
        const windows = this._getEligibleWindows();
        const live = new Set(windows);
        this._focusHistory = this._focusHistory.filter(window => live.has(window));

        for (const window of windows)
            this._rememberWindow(window);
        this._rememberFocusedWindow();

        this._cylinderSwitcherWindows = this._focusHistory.filter(window => live.has(window));
    }

    _createCylinderSwitcherActor() {
        if (this._cylinderSwitcherActor)
            return;

        const actor = new St.Widget({
            reactive: true,
            visible: true,
            opacity: 0,
        });
        actor.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));
        actor.connect('key-press-event', (_actor, event) =>
            this._handleCylinderSwitcherKeyPress(event));
        actor.connect('key-release-event', (_actor, event) =>
            this._handleCylinderSwitcherKeyRelease(event));

        if (Main.uiGroup.add_child)
            Main.uiGroup.add_child(actor);
        else
            Main.uiGroup.add_actor(actor);
        this._cylinderSwitcherActor = actor;

        const grab = Main.pushModal(actor);
        this._cylinderSwitcherGrab = grab;
    }

    _destroyCylinderSwitcherActor() {
        if (this._cylinderSwitcherGrab) {
            Main.popModal(this._cylinderSwitcherGrab);
            this._cylinderSwitcherGrab = null;
        }

        if (this._cylinderSwitcherActor) {
            this._cylinderSwitcherActor.destroy();
            this._cylinderSwitcherActor = null;
        }
    }

    _handleCylinderSwitcherKeyPress(event) {
        const keysym = event.get_key_symbol();

        if (keysym === Clutter.KEY_Escape) {
            this._finishCylinderSwitcher(false);
            return Clutter.EVENT_STOP;
        }

        if (keysym === Clutter.KEY_Tab || keysym === Clutter.KEY_ISO_Left_Tab) {
            const state = event.get_state();
            const direction = (state & Clutter.ModifierType.SHIFT_MASK) !== 0 ||
                keysym === Clutter.KEY_ISO_Left_Tab
                ? -1
                : 1;
            this._cycleCylinderSwitcher(direction);
            return Clutter.EVENT_STOP;
        }

        if (keysym === Clutter.KEY_Return ||
            keysym === Clutter.KEY_KP_Enter ||
            keysym === Clutter.KEY_space) {
            this._finishCylinderSwitcher(true);
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_STOP;
    }

    _handleCylinderSwitcherKeyRelease(_event) {
        if (!this._cylinderSwitcherModifierMask)
            return Clutter.EVENT_STOP;

        const [, , mods] = global.get_pointer();
        if ((mods & this._cylinderSwitcherModifierMask) === 0)
            this._finishCylinderSwitcherSoon(true);

        return Clutter.EVENT_STOP;
    }

    _cycleCylinderSwitcher(direction) {
        const total = this._cylinderSwitcherWindows.length;
        if (total === 0)
            return;

        this._cylinderSwitcherSelectedIndex = this._mod(
            this._cylinderSwitcherSelectedIndex + direction, total);
        this._queueApply();
    }

    _finishCylinderSwitcherSoon(activate) {
        if (this._cylinderSwitcherReleaseId)
            GLib.source_remove(this._cylinderSwitcherReleaseId);

        this._cylinderSwitcherReleaseId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            CYLINDER_SWITCHER_RELEASE_DELAY,
            () => {
                this._cylinderSwitcherReleaseId = 0;
                this._finishCylinderSwitcher(activate);
                return GLib.SOURCE_REMOVE;
            });
    }

    _finishCylinderSwitcher(activate) {
        if (!this._cylinderSwitcherActive)
            return;

        const selectedWindow = this._cylinderSwitcherWindows[this._cylinderSwitcherSelectedIndex];
        this._cylinderSwitcherActive = false;
        this._cylinderSwitcherWindows = [];
        this._cylinderSwitcherSelectedIndex = 0;
        this._cylinderSwitcherModifierMask = 0;
        this._destroyCylinderSwitcherActor();
        this._queueApply();

        if (activate && this._isEligibleWindow(selectedWindow))
            Main.activateWindow(selectedWindow);
    }

    _getBindingDirection(binding) {
        const name = binding.get_name();
        return binding.is_reversed?.() || name.endsWith('-backward') ? -1 : 1;
    }

    _primaryModifier(mask) {
        if (mask === 0)
            return 0;

        let primary = 1;
        while (mask > 1) {
            mask >>= 1;
            primary <<= 1;
        }
        return primary;
    }

    _mod(value, divisor) {
        return (value + divisor) % divisor;
    }

    _rebuildHistory() {
        const windows = this._getEligibleWindows();
        const live = new Set(windows);
        this._focusHistory = this._focusHistory.filter(window => live.has(window));

        for (const window of windows)
            this._rememberWindow(window);

        this._rememberFocusedWindow();
    }

    _rememberWindow(window) {
        if (!this._isEligibleWindow(window) || this._focusHistory.includes(window))
            return;

        this._focusHistory.push(window);
    }

    _rememberFocusedWindow() {
        const focusedWindow = global.display.focus_window;
        if (!this._isEligibleWindow(focusedWindow))
            return;

        this._focusHistory = this._focusHistory.filter(window => window !== focusedWindow);
        this._focusHistory.unshift(focusedWindow);
    }

    _getEligibleWindows() {
        return global.get_window_actors()
            .map(actor => actor.meta_window)
            .filter(window => this._isEligibleWindow(window));
    }

    _isEligibleWindow(window) {
        if (!window || window.minimized || window.is_skip_taskbar())
            return false;

        if (this._isAboveLayerWindow(window))
            return false;

        if (!WINDOW_TYPES.has(window.get_window_type()))
            return false;

        return this._isOnActiveWorkspace(window);
    }

    _isAboveLayerWindow(window) {
        if (!window || window.minimized)
            return false;

        if (!this._isOnActiveWorkspace(window))
            return false;

        if (window.get_transient_for?.() || window.is_attached_dialog?.())
            return true;

        return ABOVE_LAYER_WINDOW_TYPES.has(window.get_window_type());
    }

    _isOnActiveWorkspace(window) {
        const workspace = global.workspace_manager.get_active_workspace();
        return window.is_on_all_workspaces() || window.located_on_workspace(workspace);
    }

    _applyDepthLayout() {
        const maxLayers = this._settings.get_int('max-layers');
        const layerDistance = this._settings.get_int('layer-distance');
        const transparency = this._settings.get_int('transparency');
        const rotationXMax = this._settings.get_int('rotation-x');
        const rotationYMax = this._settings.get_int('rotation-y');
        const magneticPush = this._settings.get_boolean('use-magnetic-push')
            ? this._settings.get_int('magnetic-push')
            : 0;
        const windows = this._getEligibleWindows();
        const live = new Set(windows);
        this._syncWindowSignals(windows);

        this._focusHistory = this._focusHistory.filter(window => live.has(window));
        for (const window of windows)
            this._rememberWindow(window);
        this._rememberFocusedWindow();

        const actorByWindow = new Map();
        const aboveLayerActors = [];
        for (const actor of global.get_window_actors()) {
            const window = actor.meta_window;
            if (!window)
                continue;

            actorByWindow.set(window, actor);
            if (this._isAboveLayerWindow(window))
                aboveLayerActors.push(actor);
        }

        const activeWindow = global.display.focus_window;
        const activeRect = this._isEligibleWindow(activeWindow)
            ? activeWindow.get_frame_rect()
            : null;
        const resetActors = new Set(this._trackedActors);
        const orderedActors = [];

        for (const window of this._focusHistory) {
            const actor = actorByWindow.get(window);
            if (!actor)
                continue;

            resetActors.delete(actor);
            this._trackedActors.add(actor);
            orderedActors.push(actor);

            const rawIndex = this._focusHistory.indexOf(window);
            const layer = Math.min(rawIndex, maxLayers - 1);
            const options = {
                layerDistance,
                transparency,
                rotationXMax,
                rotationYMax,
                magneticPush,
            };

            if (this._cylinderSwitcherActive) {
                this._styleCylinderSwitcherWindow(actor, window, options);
                continue;
            }

            this._styleLayer(actor, layer, maxLayers, options,
                window === activeWindow,
                this._getMagneticPush(window, activeRect, magneticPush),
                window,
                activeRect);
        }

        for (const actor of resetActors) {
            this._trackedActors.delete(actor);
            this._resetActor(actor, false);
        }

        this._restackActors(orderedActors, maxLayers, aboveLayerActors);
    }

    _syncWindowSignals(windows) {
        const live = new Set(windows);

        for (const [window, ids] of this._windowSignals) {
            if (live.has(window))
                continue;

            for (const id of ids)
                window.disconnect(id);
            this._windowSignals.delete(window);
        }

        for (const window of windows) {
            if (this._windowSignals.has(window))
                continue;

            this._windowSignals.set(window, [
                window.connect('position-changed', () => {
                    if (window !== global.display.focus_window ||
                        (this._settings.get_boolean('use-magnetic-push') &&
                            this._settings.get_boolean('adjust-surrounding-windows-on-focused-move')))
                        this._queueApply();
                }),
                window.connect('size-changed', () => this._queueApply()),
                window.connect('unmanaged', () => this._queueApply()),
            ]);
        }
    }

    _styleLayer(actor, layer, maxLayers, options, isFocused, magneticOffset, window, activeRect) {
        actor.remove_all_transitions();
        actor.set_pivot_point(0.5, 0.5);

        if (isFocused) {
            actor.ease({
                scale_x: 1,
                scale_y: 1,
                translation_x: 0,
                translation_y: 0,
                translation_z: 0,
                rotation_angle_x: 0,
                rotation_angle_y: 0,
                opacity: 255,
                duration: ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            return;
        }

        const scaleStep = Math.min(MAX_SCALE_PER_LAYER, MIN_SCALE_PER_LAYER + options.layerDistance / 2400);
        const scale = Math.max(0.58, 1 - layer * scaleStep);
        const sideOffset = layer * Math.max(10, Math.round(options.layerDistance * 0.22));
        const verticalOffset = layer * Math.max(18, Math.round(options.layerDistance * 0.42));
        const translationX = sideOffset + magneticOffset.x;
        const translationY = verticalOffset + magneticOffset.y;
        const depthRatio = layer / Math.max(1, maxLayers - 1);
        const sphericalRotation = this._getSphericalLayerRotation(
            window, activeRect, translationX, translationY, depthRatio, options);
        const opacity = Math.round(255 * (1 - options.transparency / 100 * depthRatio));

        actor.ease({
            scale_x: scale,
            scale_y: scale,
            translation_x: translationX,
            translation_y: translationY,
            translation_z: 0,
            rotation_angle_x: sphericalRotation.x,
            rotation_angle_y: sphericalRotation.y,
            opacity,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _getSphericalLayerRotation(window, activeRect, translationX, translationY, depthRatio, options) {
        if (!window || !activeRect) {
            return {
                x: -options.rotationXMax * depthRatio,
                y: options.rotationYMax * depthRatio,
            };
        }

        const rect = window.get_frame_rect();
        const monitor = this._getCurrentMonitorGeometry();
        const activeCenterX = activeRect.x + activeRect.width / 2;
        const activeCenterY = activeRect.y + activeRect.height / 2;
        const windowCenterX = rect.x + rect.width / 2 + translationX;
        const windowCenterY = rect.y + rect.height / 2 + translationY;
        const normalizeX = Math.max(activeRect.width * 0.7, monitor.width * 0.34, 1);
        const normalizeY = Math.max(activeRect.height * 0.7, monitor.height * 0.34, 1);
        const offsetX = this._clamp((windowCenterX - activeCenterX) / normalizeX, -1, 1);
        const offsetY = this._clamp((windowCenterY - activeCenterY) / normalizeY, -1, 1);
        const strength = 0.35 + depthRatio * 0.85;

        return {
            x: offsetY * options.rotationXMax * strength,
            y: -offsetX * options.rotationYMax * strength,
        };
    }

    _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    _styleCylinderSwitcherWindow(actor, window, options) {
        actor.remove_all_transitions();
        actor.set_pivot_point(0.5, 0.5);

        const rect = actor.meta_window.get_frame_rect();
        const monitor = this._getCurrentMonitorGeometry();
        const total = this._cylinderSwitcherWindows.length;
        const index = this._cylinderSwitcherWindows.indexOf(window);
        const rawOffset = this._getCylinderShortestOffset(index, this._cylinderSwitcherSelectedIndex, total);
        const visibleOffset = Math.max(
            -CYLINDER_SWITCHER_VISIBLE_SIDE_WINDOWS,
            Math.min(CYLINDER_SWITCHER_VISIBLE_SIDE_WINDOWS, rawOffset));
        const displayOffset = -visibleOffset;
        const absOffset = Math.abs(visibleOffset);
        const centerX = monitor.x + monitor.width / 2;
        const centerY = monitor.y + monitor.height / 2;
        const actorCenterX = rect.x + rect.width / 2;
        const actorCenterY = rect.y + rect.height / 2;
        const maxWidth = monitor.width * 0.46;
        const maxHeight = monitor.height * 0.56;
        const baseScale = Math.min(0.92, maxWidth / Math.max(1, rect.width), maxHeight / Math.max(1, rect.height));
        const scale = Math.max(0.34, baseScale * Math.pow(0.86, absOffset));
        const targetCenterX = centerX + displayOffset * monitor.width * CYLINDER_SWITCHER_SIDE_STEP_RATIO;
        const targetCenterY = centerY + absOffset * monitor.height * 0.035;
        const yawMax = Math.min(34, Math.max(18, options.rotationYMax * 2.1));
        const depthRatio = absOffset / Math.max(1, CYLINDER_SWITCHER_VISIBLE_SIDE_WINDOWS);
        const opacity = Math.round(255 * (1 - options.transparency / 100 * depthRatio));

        actor.ease({
            scale_x: scale,
            scale_y: scale,
            translation_x: targetCenterX - actorCenterX,
            translation_y: targetCenterY - actorCenterY,
            translation_z: -options.layerDistance * CYLINDER_SWITCHER_DEPTH_RATIO * absOffset,
            rotation_angle_x: 0,
            rotation_angle_y: -displayOffset * yawMax / CYLINDER_SWITCHER_VISIBLE_SIDE_WINDOWS,
            opacity,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _getCylinderShortestOffset(index, selectedIndex, total) {
        if (index < 0 || total <= 0)
            return 0;

        let offset = selectedIndex - index;
        if (offset > total / 2)
            offset -= total;
        else if (offset < -total / 2)
            offset += total;
        return offset;
    }

    _getCurrentMonitorGeometry() {
        const monitorIndex = global.display.get_current_monitor?.() ?? 0;
        return global.display.get_monitor_geometry(monitorIndex);
    }

    _getMagneticPush(window, activeRect, magneticPush) {
        if (!activeRect || !window || magneticPush <= 0 || window === global.display.focus_window)
            return {x: 0, y: 0};

        const rect = window.get_frame_rect();
        const overlapWidth = Math.min(activeRect.x + activeRect.width, rect.x + rect.width) -
            Math.max(activeRect.x, rect.x);
        const overlapHeight = Math.min(activeRect.y + activeRect.height, rect.y + rect.height) -
            Math.max(activeRect.y, rect.y);

        if (overlapWidth <= 0 || overlapHeight <= 0)
            return {x: 0, y: 0};

        const activeCenterX = activeRect.x + activeRect.width / 2;
        const activeCenterY = activeRect.y + activeRect.height / 2;
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        let directionX = centerX - activeCenterX;
        let directionY = centerY - activeCenterY;

        if (directionX === 0 && directionY === 0) {
            directionX = rect.x >= activeRect.x ? 1 : -1;
            directionY = rect.y >= activeRect.y ? 1 : -1;
        }

        const overlapArea = overlapWidth * overlapHeight;
        const smallerArea = Math.max(1, Math.min(activeRect.width * activeRect.height, rect.width * rect.height));
        const overlapRatio = Math.min(1, overlapArea / smallerArea);
        const strength = magneticPush * (0.35 + overlapRatio * 0.65);

        if (Math.abs(directionX) >= Math.abs(directionY)) {
            const sign = directionX >= 0 ? 1 : -1;
            const partialPush = overlapWidth * (1 - MAGNETIC_OVERLAP_RATIO);
            return {x: sign * Math.min(strength, partialPush), y: 0};
        }

        const sign = directionY >= 0 ? 1 : -1;
        const partialPush = overlapHeight * (1 - MAGNETIC_OVERLAP_RATIO);
        return {x: 0, y: sign * Math.min(strength, partialPush)};
    }

    _restackActors(actors, maxLayers, aboveLayerActors = []) {
        if (this._cylinderSwitcherActive) {
            const layered = actors.map(actor => {
                const index = this._cylinderSwitcherWindows.indexOf(actor.meta_window);
                const offset = this._getCylinderShortestOffset(
                    index, this._cylinderSwitcherSelectedIndex, this._cylinderSwitcherWindows.length);
                return {
                    actor,
                    distance: Math.abs(offset),
                };
            });

            layered.sort((a, b) => b.distance - a.distance);

            for (const item of layered)
                global.window_group.set_child_above_sibling(item.actor, null);
            for (const actor of aboveLayerActors)
                global.window_group.set_child_above_sibling(actor, null);
            return;
        }

        const layered = actors.map((actor, index) => ({
            actor,
            layer: Math.min(index, maxLayers - 1),
            index,
        }));

        layered.sort((a, b) => {
            if (b.layer !== a.layer)
                return b.layer - a.layer;
            return b.index - a.index;
        });

        for (const item of layered)
            global.window_group.set_child_above_sibling(item.actor, null);
        for (const actor of aboveLayerActors)
            global.window_group.set_child_above_sibling(actor, null);
    }

    _resetActor(actor, immediate) {
        if (!actor)
            return;

        actor.remove_all_transitions();
        actor.set_pivot_point(0, 0);

        if (immediate) {
            actor.scale_x = 1;
            actor.scale_y = 1;
            actor.translation_x = 0;
            actor.translation_y = 0;
            actor.translation_z = 0;
            actor.rotation_angle_x = 0;
            actor.rotation_angle_y = 0;
            actor.opacity = 255;
            return;
        }

        actor.ease({
            scale_x: 1,
            scale_y: 1,
            translation_x: 0,
            translation_y: 0,
            translation_z: 0,
            rotation_angle_x: 0,
            rotation_angle_y: 0,
            opacity: 255,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }
}
