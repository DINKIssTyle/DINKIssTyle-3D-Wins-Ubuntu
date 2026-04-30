/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const ANIMATION_TIME = 220;
const MIN_SCALE_PER_LAYER = 0.045;
const MAX_SCALE_PER_LAYER = 0.085;
const MAGNETIC_OVERLAP_RATIO = 0.10;
const PUSH_APART_PADDING = 18;
const PUSH_APART_ITERATIONS = 14;
const PUSH_APART_FIT_ITERATIONS = 8;
const PUSH_APART_FINAL_ITERATIONS = 18;
const PUSH_APART_ACTIVE_WEIGHT = 1.2;
const PUSH_APART_MIN_STAGGER = 52;
const PUSH_APART_MIN_SCALE = 0.18;
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
const PANEL_ICON_SIZE = 32;
const PANEL_BUTTON_HPADDING = 1;

const Dkst3DWinsIndicator = GObject.registerClass(
class Dkst3DWinsIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'DINKIssTyle 3D Wins');

        this._extension = extension;
        this._settings = extension._settings;
        this._signals = [];
        this.set_style(
            `-natural-hpadding: ${PANEL_BUTTON_HPADDING}px; ` +
            `-minimum-hpadding: ${PANEL_BUTTON_HPADDING}px; ` +
            `padding-left: ${PANEL_BUTTON_HPADDING}px; ` +
            `padding-right: ${PANEL_BUTTON_HPADDING}px;`);

        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(GLib.build_filenamev([extension.path, 'icon.png'])),
            icon_size: PANEL_ICON_SIZE,
            style_class: 'system-status-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        icon.set_size(PANEL_ICON_SIZE, PANEL_ICON_SIZE);
        this.add_child(icon);

        this._windowEffectItem = new PopupMenu.PopupSwitchMenuItem(
            'Window Effect Toggle',
            this._settings.get_boolean('use-window-effect'));
        this._altTabEffectItem = new PopupMenu.PopupSwitchMenuItem(
            'Alt-Tab Effect Toggle',
            this._settings.get_boolean('use-cylinder-switcher'));
        const openSettingsItem = new PopupMenu.PopupMenuItem('Open Settings');

        this.menu.addMenuItem(this._windowEffectItem);
        this.menu.addMenuItem(this._altTabEffectItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(openSettingsItem);

        this._signals.push([
            this._windowEffectItem,
            this._windowEffectItem.connect('toggled', (_item, state) => {
                if (this._settings.get_boolean('use-window-effect') !== state)
                    this._settings.set_boolean('use-window-effect', state);
            }),
        ]);
        this._signals.push([
            this._altTabEffectItem,
            this._altTabEffectItem.connect('toggled', (_item, state) => {
                if (this._settings.get_boolean('use-cylinder-switcher') !== state)
                    this._settings.set_boolean('use-cylinder-switcher', state);
            }),
        ]);
        this._signals.push([
            openSettingsItem,
            openSettingsItem.connect('activate', () => {
                this.menu.close();
                this._extension.openPreferences();
            }),
        ]);
        this._signals.push([
            this._settings,
            this._settings.connect('changed::use-window-effect', () =>
                this._syncSwitch(this._windowEffectItem, 'use-window-effect')),
        ]);
        this._signals.push([
            this._settings,
            this._settings.connect('changed::use-cylinder-switcher', () =>
                this._syncSwitch(this._altTabEffectItem, 'use-cylinder-switcher')),
        ]);
    }

    destroy() {
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        this._extension = null;
        this._settings = null;

        super.destroy();
    }

    _syncSwitch(item, key) {
        const value = this._settings.get_boolean(key);
        if (item.state !== value)
            item.setToggleState(value);
    }
});

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
        this._indicator = null;

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
        this._connect(this._settings, 'changed::show-system-tray', () => this._syncIndicator());
        this._patchWindowSwitcherKeybindings();
        this._syncIndicator();

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
        this._destroyIndicator();

        this._trackedActors.clear();
        this._focusHistory = [];
        this._cylinderSwitcherActive = false;
        this._cylinderSwitcherWindows = [];
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _syncIndicator() {
        if (this._settings.get_boolean('show-system-tray')) {
            if (!this._indicator) {
                this._indicator = new Dkst3DWinsIndicator(this);
                Main.panel.addToStatusArea(this.uuid, this._indicator);
            }
            return;
        }

        this._destroyIndicator();
    }

    _destroyIndicator() {
        if (!this._indicator)
            return;

        this._indicator.destroy();
        this._indicator = null;
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
        const useWindowEffect = this._settings.get_boolean('use-window-effect');
        const maxLayers = this._settings.get_int('max-layers');
        const layerDistance = this._settings.get_int('layer-distance');
        const perspectiveStrength = this._settings.get_int('perspective-strength');
        const layerShrink = this._settings.get_int('layer-shrink');
        const transparency = this._settings.get_int('transparency');
        const rotationXMax = this._settings.get_int('rotation-x');
        const rotationYMax = this._settings.get_int('rotation-y');
        const magneticPush = this._settings.get_boolean('use-magnetic-push')
            ? this._settings.get_int('magnetic-push')
            : 0;
        const usePushApart = this._settings.get_boolean('use-push-apart');
        const windows = this._getEligibleWindows();
        const live = new Set(windows);
        this._syncWindowSignals(windows);

        this._focusHistory = this._focusHistory.filter(window => live.has(window));
        for (const window of windows)
            this._rememberWindow(window);
        this._rememberFocusedWindow();

        if (!useWindowEffect && !this._cylinderSwitcherActive) {
            for (const actor of this._trackedActors)
                this._resetActor(actor, false);
            this._trackedActors.clear();
            return;
        }

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
        const options = {
            layerDistance,
            perspectiveStrength,
            layerShrink,
            transparency,
            rotationXMax,
            rotationYMax,
            magneticPush,
        };
        const resetActors = new Set(this._trackedActors);
        const orderedActors = [];
        const layerItems = [];

        for (const window of this._focusHistory) {
            const actor = actorByWindow.get(window);
            if (!actor)
                continue;

            resetActors.delete(actor);
            this._trackedActors.add(actor);
            orderedActors.push(actor);

            const rawIndex = this._focusHistory.indexOf(window);
            const layer = Math.min(rawIndex, maxLayers - 1);

            if (this._cylinderSwitcherActive) {
                this._styleCylinderSwitcherWindow(actor, window, options);
                continue;
            }

            const isFocused = window === activeWindow;
            layerItems.push({
                actor,
                window,
                layer,
                order: layerItems.length,
                isFocused,
                magneticOffset: this._getMagneticPush(window, activeRect, magneticPush),
                pushApartOffset: { x: 0, y: 0 },
                pushApartScale: 1,
            });
        }

        if (!this._cylinderSwitcherActive && usePushApart && layerItems.length > 1)
            this._applyPushApartOffsets(layerItems, maxLayers, options);

        for (const item of layerItems) {
            this._styleLayer(item.actor, item.layer, maxLayers, options,
                item.isFocused,
                item.magneticOffset,
                item.window,
                activeRect,
                item.pushApartOffset,
                item.pushApartScale);
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

    _styleLayer(actor, layer, maxLayers, options, isFocused, magneticOffset, window, activeRect,
        pushApartOffset = { x: 0, y: 0 }, pushApartScale = 1) {
        actor.remove_all_transitions();
        actor.set_pivot_point(0.5, 0.5);

        if (isFocused && pushApartScale === 1 &&
            pushApartOffset.x === 0 && pushApartOffset.y === 0) {
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

        const placement = this._getLayerPlacement(layer, maxLayers, options,
            magneticOffset, pushApartOffset, pushApartScale);
        const translationX = placement.translationX;
        const translationY = placement.translationY;
        const depthRatio = layer / Math.max(1, maxLayers - 1);
        const sphericalRotation = isFocused
            ? { x: 0, y: 0 }
            : this._getSphericalLayerRotation(
                window, activeRect, translationX, translationY, depthRatio, options);
        const opacity = isFocused
            ? 255
            : Math.round(255 * (1 - options.transparency / 100 * depthRatio));

        actor.ease({
            scale_x: placement.scale,
            scale_y: placement.scale,
            translation_x: translationX,
            translation_y: translationY,
            translation_z: isFocused ? 0 : -layer * (options.layerDistance * 1.5),
            rotation_angle_x: sphericalRotation.x,
            rotation_angle_y: sphericalRotation.y,
            opacity,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _getLayerPlacement(layer, maxLayers, options, magneticOffset = { x: 0, y: 0 },
        pushApartOffset = { x: 0, y: 0 }, pushApartScale = 1) {
        const scaleStep = (Math.min(MAX_SCALE_PER_LAYER, MIN_SCALE_PER_LAYER + options.layerDistance / 2400) *
            options.layerShrink / 100) * 0.5;
        const scale = Math.max(0.48, 1 - layer * scaleStep) * pushApartScale;
        const sideOffset = layer * Math.max(10, Math.round(options.layerDistance * 0.22));
        const verticalOffset = layer * Math.max(18, Math.round(options.layerDistance * 0.42));

        return {
            scale,
            translationX: sideOffset + magneticOffset.x + pushApartOffset.x,
            translationY: verticalOffset + magneticOffset.y + pushApartOffset.y,
        };
    }

    _applyPushApartOffsets(items, maxLayers, options) {
        const spreadable = items.filter(item => !item.isFocused);
        if (spreadable.length === 0)
            return;

        const monitor = this._getCurrentMonitorGeometry();
        const largestItem = items.reduce((largest, item) => {
            const rect = item.window.get_frame_rect();
            return Math.max(largest, rect.width, rect.height);
        }, 0);
        const maxOffset = Math.max(
            options.magneticPush * 3.2,
            options.layerDistance * 2.8,
            largestItem * 0.55,
            Math.max(monitor.width, monitor.height),
            PUSH_APART_MIN_STAGGER * Math.min(spreadable.length, 5));

        this._seedPushApartOffsets(spreadable, maxOffset);
        for (const item of spreadable)
            this._movePushApartItem(item, true, 0, maxOffset, monitor, maxLayers, options);

        for (let iteration = 0; iteration < PUSH_APART_ITERATIONS; iteration++) {
            let moved = false;
            const rects = new Map(items.map(item => [item, this._getPushApartRect(item, maxLayers, options)]));

            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const first = items[i];
                    const second = items[j];

                    if (first.isFocused && second.isFocused)
                        continue;

                    const firstRect = rects.get(first);
                    const secondRect = rects.get(second);
                    const overlapX = Math.min(firstRect.x + firstRect.width, secondRect.x + secondRect.width) -
                        Math.max(firstRect.x, secondRect.x);
                    const overlapY = Math.min(firstRect.y + firstRect.height, secondRect.y + secondRect.height) -
                        Math.max(firstRect.y, secondRect.y);

                    if (overlapX <= 0 || overlapY <= 0)
                        continue;

                    const firstCenterX = firstRect.x + firstRect.width / 2;
                    const firstCenterY = firstRect.y + firstRect.height / 2;
                    const secondCenterX = secondRect.x + secondRect.width / 2;
                    const secondCenterY = secondRect.y + secondRect.height / 2;
                    const centerDeltaX = secondCenterX - firstCenterX;
                    const centerDeltaY = secondCenterY - firstCenterY;
                    const fallbackHorizontal = ((first.order + second.order) % 2) === 0;
                    const separateOnX = centerDeltaX === 0 && centerDeltaY === 0
                        ? fallbackHorizontal
                        : overlapX <= overlapY;
                    const direction = this._getPushApartDirection(
                        first, second, separateOnX, centerDeltaX, centerDeltaY);
                    const distance = (separateOnX ? overlapX : overlapY) + PUSH_APART_PADDING;
                    const firstWeight = first.isFocused ? 0 : (second.isFocused ? PUSH_APART_ACTIVE_WEIGHT : 0.5);
                    const secondWeight = second.isFocused ? 0 : (first.isFocused ? PUSH_APART_ACTIVE_WEIGHT : 0.5);

                    if (firstWeight > 0) {
                        this._movePushApartItem(first, separateOnX, -direction * distance * firstWeight,
                            maxOffset, monitor, maxLayers, options);
                        moved = true;
                    }

                    if (secondWeight > 0) {
                        this._movePushApartItem(second, separateOnX, direction * distance * secondWeight,
                            maxOffset, monitor, maxLayers, options);
                        moved = true;
                    }
                }
            }

            if (!moved)
                break;
        }

        this._fitPushApartItems(items, maxOffset, monitor, maxLayers, options);
        this._resolveRemainingPushApartOverlaps(items, maxOffset, monitor, maxLayers, options);
    }

    _seedPushApartOffsets(items, maxOffset) {
        const center = (items.length - 1) / 2;
        const columns = Math.max(1, Math.ceil(Math.sqrt(items.length)));

        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const column = index % columns;
            const row = Math.floor(index / columns);
            const centeredColumn = column - (Math.min(columns, items.length) - 1) / 2;
            const centeredRow = row - Math.floor((items.length - 1) / columns) / 2;
            const diagonal = index - center;

            item.pushApartOffset.x = this._clamp(
                centeredColumn * PUSH_APART_MIN_STAGGER + diagonal * PUSH_APART_MIN_STAGGER * 0.35,
                -maxOffset,
                maxOffset);
            item.pushApartOffset.y = this._clamp(
                centeredRow * PUSH_APART_MIN_STAGGER + Math.abs(diagonal) * PUSH_APART_MIN_STAGGER * 0.22,
                -maxOffset,
                maxOffset);
        }
    }

    _getPushApartDirection(first, second, horizontal, centerDeltaX, centerDeltaY) {
        const delta = horizontal ? centerDeltaX : centerDeltaY;
        if (delta !== 0)
            return delta > 0 ? 1 : -1;

        return second.order >= first.order ? 1 : -1;
    }

    _getPushApartRect(item, maxLayers, options) {
        const rect = item.window.get_frame_rect();
        const placement = this._getLayerPlacement(item.layer, maxLayers, options,
            item.magneticOffset, item.pushApartOffset, item.pushApartScale);
        const width = rect.width * placement.scale;
        const height = rect.height * placement.scale;
        const centerX = rect.x + rect.width / 2 + placement.translationX;
        const centerY = rect.y + rect.height / 2 + placement.translationY;

        return {
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
        };
    }

    _fitPushApartItems(items, maxOffset, monitor, maxLayers, options) {
        for (let iteration = 0; iteration < PUSH_APART_FIT_ITERATIONS; iteration++) {
            let changed = false;

            for (const item of items) {
                if (!item.isFocused)
                    this._movePushApartItem(item, true, 0, maxOffset, monitor, maxLayers, options);

                if (!item.isFocused)
                    changed = this._shrinkPushApartItemToMonitor(item, monitor, maxLayers, options) || changed;
            }

            const rects = new Map(items.map(item => [item, this._getPushApartRect(item, maxLayers, options)]));

            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const first = items[i];
                    const second = items[j];
                    const firstRect = rects.get(first);
                    const secondRect = rects.get(second);
                    const overlapX = Math.min(firstRect.x + firstRect.width, secondRect.x + secondRect.width) -
                        Math.max(firstRect.x, secondRect.x);
                    const overlapY = Math.min(firstRect.y + firstRect.height, secondRect.y + secondRect.height) -
                        Math.max(firstRect.y, secondRect.y);

                    if (overlapX <= 0 || overlapY <= 0)
                        continue;

                    const pressure = Math.max(
                        overlapX / Math.max(1, Math.min(firstRect.width, secondRect.width)),
                        overlapY / Math.max(1, Math.min(firstRect.height, secondRect.height)));
                    const factor = 1 - this._clamp(pressure * 0.55, 0.04, 0.18);

                    if (!first.isFocused)
                        changed = this._shrinkPushApartItem(first, factor) || changed;

                    if (!second.isFocused)
                        changed = this._shrinkPushApartItem(second, factor) || changed;
                }
            }

            if (!changed)
                break;
        }
    }

    _resolveRemainingPushApartOverlaps(items, maxOffset, monitor, maxLayers, options) {
        for (let iteration = 0; iteration < PUSH_APART_FINAL_ITERATIONS; iteration++) {
            let changed = false;
            const rects = new Map(items.map(item => [item, this._getPushApartRect(item, maxLayers, options)]));

            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const first = items[i];
                    const second = items[j];
                    const overlap = this._getPushApartOverlap(rects.get(first), rects.get(second));

                    if (!overlap)
                        continue;

                    const separateOnX = this._shouldSeparatePushApartOnX(overlap, first, second, rects);
                    const firstWeight = first.isFocused ? 0 : (second.isFocused ? 1 : 0.5);
                    const secondWeight = second.isFocused ? 0 : (first.isFocused ? 1 : 0.5);

                    if (firstWeight > 0 || secondWeight > 0) {
                        const beforeFirst = { ...first.pushApartOffset };
                        const beforeSecond = { ...second.pushApartOffset };
                        const firstRect = rects.get(first);
                        const secondRect = rects.get(second);
                        const centerDeltaX = secondRect.x + secondRect.width / 2 -
                            (firstRect.x + firstRect.width / 2);
                        const centerDeltaY = secondRect.y + secondRect.height / 2 -
                            (firstRect.y + firstRect.height / 2);
                        const direction = this._getPushApartDirection(
                            first, second, separateOnX, centerDeltaX, centerDeltaY);
                        const distance = (separateOnX ? overlap.x : overlap.y) + PUSH_APART_PADDING;

                        if (firstWeight > 0)
                            this._movePushApartItem(first, separateOnX, -direction * distance * firstWeight,
                                maxOffset, monitor, maxLayers, options);

                        if (secondWeight > 0)
                            this._movePushApartItem(second, separateOnX, direction * distance * secondWeight,
                                maxOffset, monitor, maxLayers, options);

                        changed = changed ||
                            beforeFirst.x !== first.pushApartOffset.x ||
                            beforeFirst.y !== first.pushApartOffset.y ||
                            beforeSecond.x !== second.pushApartOffset.x ||
                            beforeSecond.y !== second.pushApartOffset.y;
                    }

                    if (this._getPushApartOverlap(
                        this._getPushApartRect(first, maxLayers, options),
                        this._getPushApartRect(second, maxLayers, options))) {
                        const shrinkFirst = !first.isFocused && this._canShrinkPushApartItem(first);
                        const shrinkSecond = !second.isFocused && this._canShrinkPushApartItem(second);

                        if (shrinkFirst)
                            changed = this._shrinkPushApartItem(first, 0.88) || changed;

                        if (shrinkSecond)
                            changed = this._shrinkPushApartItem(second, 0.88) || changed;

                        if (shrinkFirst || shrinkSecond) {
                            if (!first.isFocused)
                                this._movePushApartItem(first, true, 0, maxOffset, monitor, maxLayers, options);

                            if (!second.isFocused)
                                this._movePushApartItem(second, true, 0, maxOffset, monitor, maxLayers, options);
                        }
                    }
                }
            }

            if (!changed)
                break;
        }
    }

    _getPushApartOverlap(firstRect, secondRect) {
        const overlapX = Math.min(firstRect.x + firstRect.width, secondRect.x + secondRect.width) -
            Math.max(firstRect.x, secondRect.x);
        const overlapY = Math.min(firstRect.y + firstRect.height, secondRect.y + secondRect.height) -
            Math.max(firstRect.y, secondRect.y);

        if (overlapX <= 0 || overlapY <= 0)
            return null;

        return { x: overlapX, y: overlapY };
    }

    _shouldSeparatePushApartOnX(overlap, first, second, rects) {
        if (overlap.x !== overlap.y)
            return overlap.x <= overlap.y;

        const firstRect = rects.get(first);
        const secondRect = rects.get(second);
        const centerDeltaX = Math.abs(secondRect.x + secondRect.width / 2 -
            (firstRect.x + firstRect.width / 2));
        const centerDeltaY = Math.abs(secondRect.y + secondRect.height / 2 -
            (firstRect.y + firstRect.height / 2));

        if (centerDeltaX !== centerDeltaY)
            return centerDeltaX >= centerDeltaY;

        return ((first.order + second.order) % 2) === 0;
    }

    _shrinkPushApartItemToMonitor(item, monitor, maxLayers, options) {
        const rect = item.window.get_frame_rect();
        const placement = this._getLayerPlacement(item.layer, maxLayers, options,
            item.magneticOffset, item.pushApartOffset, item.pushApartScale);
        const centerX = rect.x + rect.width / 2 + placement.translationX;
        const centerY = rect.y + rect.height / 2 + placement.translationY;
        const left = monitor.x + PUSH_APART_PADDING;
        const right = monitor.x + monitor.width - PUSH_APART_PADDING;
        const top = monitor.y + PUSH_APART_PADDING;
        const bottom = monitor.y + monitor.height - PUSH_APART_PADDING;
        const availableWidth = Math.max(1, 2 * Math.min(centerX - left, right - centerX));
        const availableHeight = Math.max(1, 2 * Math.min(centerY - top, bottom - centerY));
        const currentWidth = rect.width * placement.scale;
        const currentHeight = rect.height * placement.scale;
        const factor = Math.min(1, availableWidth / Math.max(1, currentWidth),
            availableHeight / Math.max(1, currentHeight));

        return factor < 1 && this._shrinkPushApartItem(item, factor);
    }

    _shrinkPushApartItem(item, factor) {
        const nextScale = this._clamp(item.pushApartScale * factor, PUSH_APART_MIN_SCALE, 1);

        if (Math.abs(nextScale - item.pushApartScale) < 0.001)
            return false;

        item.pushApartScale = nextScale;
        return true;
    }

    _canShrinkPushApartItem(item) {
        return item.pushApartScale > PUSH_APART_MIN_SCALE + 0.001;
    }

    _movePushApartItem(item, horizontal, delta, maxOffset, monitor, maxLayers, options) {
        if (horizontal)
            item.pushApartOffset.x = this._clamp(item.pushApartOffset.x + delta, -maxOffset, maxOffset);
        else
            item.pushApartOffset.y = this._clamp(item.pushApartOffset.y + delta, -maxOffset, maxOffset);

        const rect = this._getPushApartRect(item, maxLayers, options);

        if (rect.x < monitor.x + PUSH_APART_PADDING)
            item.pushApartOffset.x += monitor.x + PUSH_APART_PADDING - rect.x;
        else if (rect.x + rect.width > monitor.x + monitor.width - PUSH_APART_PADDING)
            item.pushApartOffset.x -= rect.x + rect.width - (monitor.x + monitor.width - PUSH_APART_PADDING);

        if (rect.y < monitor.y + PUSH_APART_PADDING)
            item.pushApartOffset.y += monitor.y + PUSH_APART_PADDING - rect.y;
        else if (rect.y + rect.height > monitor.y + monitor.height - PUSH_APART_PADDING)
            item.pushApartOffset.y -= rect.y + rect.height - (monitor.y + monitor.height - PUSH_APART_PADDING);
    }

    _getSphericalLayerRotation(window, activeRect, translationX, translationY, depthRatio, options) {
        const perspectiveRatio = options.perspectiveStrength / 100;

        if (!window || !activeRect) {
            return {
                x: -options.rotationXMax * depthRatio * perspectiveRatio,
                y: options.rotationYMax * depthRatio * perspectiveRatio,
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
            x: offsetY * options.rotationXMax * strength * perspectiveRatio,
            y: -offsetX * options.rotationYMax * strength * perspectiveRatio,
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
        const cylinderScaleDrop = 1 - (1 - Math.pow(0.86, absOffset)) * options.layerShrink / 100;
        const scale = Math.max(0.34, baseScale * cylinderScaleDrop);
        const targetCenterX = centerX + displayOffset * monitor.width * CYLINDER_SWITCHER_SIDE_STEP_RATIO;
        const targetCenterY = centerY + absOffset * monitor.height * 0.035;
        const yawMax = Math.min(34, Math.max(18, options.rotationYMax * 2.1)) *
            options.perspectiveStrength / 100;
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
            return { x: 0, y: 0 };

        const rect = window.get_frame_rect();
        const overlapWidth = Math.min(activeRect.x + activeRect.width, rect.x + rect.width) -
            Math.max(activeRect.x, rect.x);
        const overlapHeight = Math.min(activeRect.y + activeRect.height, rect.y + rect.height) -
            Math.max(activeRect.y, rect.y);

        if (overlapWidth <= 0 || overlapHeight <= 0)
            return { x: 0, y: 0 };

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
            return { x: sign * Math.min(strength, partialPush), y: 0 };
        }

        const sign = directionY >= 0 ? 1 : -1;
        const partialPush = overlapHeight * (1 - MAGNETIC_OVERLAP_RATIO);
        return { x: 0, y: sign * Math.min(strength, partialPush) };
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
