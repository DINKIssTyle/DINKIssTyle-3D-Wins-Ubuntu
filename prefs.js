/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Dkst3DWinsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: '3D Wins',
            icon_name: 'preferences-system-windows-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Layer Depth',
            description: 'Focused windows stay full size. Older focused windows move backward into lower layers.',
        });

        const maxLayers = Adw.SpinRow.new_with_range(2, 12, 1);
        maxLayers.title = 'Maximum layers';
        maxLayers.subtitle = 'Default is 5. The last layer holds every older window together.';
        this._bindIntSpin(settings, 'max-layers', maxLayers);

        const layerDistance = Adw.SpinRow.new_with_range(20, 220, 5);
        layerDistance.title = 'Distance between layers';
        layerDistance.subtitle = 'Higher values create stronger depth and separation.';
        this._bindIntSpin(settings, 'layer-distance', layerDistance);

        const perspectiveStrength = Adw.SpinRow.new_with_range(0, 140, 5);
        perspectiveStrength.title = 'Perspective strength';
        perspectiveStrength.subtitle = 'Default is 100. Lower values reduce layer shrinking and perspective tilt.';
        this._bindIntSpin(settings, 'perspective-strength', perspectiveStrength);

        const magneticPush = Adw.SpinRow.new_with_range(0, 220, 5);
        magneticPush.title = 'Magnetic push';
        magneticPush.subtitle = 'Pushes overlapping background windows away from the focused window while keeping some overlap.';
        this._bindIntSpin(settings, 'magnetic-push', magneticPush);

        const useMagneticPush = new Adw.SwitchRow({
            title: 'Use magnetic push',
            subtitle: 'Enable the magnetic push effect for overlapping background windows.',
        });
        this._bindBoolSwitch(settings, 'use-magnetic-push', useMagneticPush);

        const adjustOnFocusedMove = new Adw.SwitchRow({
            title: 'Adjust surrounding windows while moving focused window',
            subtitle: 'Updates nearby background windows as the focused window moves.',
        });
        this._bindBoolSwitch(settings, 'adjust-surrounding-windows-on-focused-move', adjustOnFocusedMove);

        const useCylinderSwitcher = new Adw.SwitchRow({
            title: 'Use cylindrical Alt-Tab switcher',
            subtitle: 'Replaces the default Alt-Tab popup with a one-row 3D cylinder window switcher.',
        });
        this._bindBoolSwitch(settings, 'use-cylinder-switcher', useCylinderSwitcher);

        const transparency = Adw.SpinRow.new_with_range(0, 100, 1);
        transparency.title = 'Transparency';
        transparency.subtitle = 'Default is 0. Higher values make deeper layers more transparent.';
        this._bindIntSpin(settings, 'transparency', transparency);

        const rotationX = Adw.SpinRow.new_with_range(0, 45, 1);
        rotationX.title = 'X rotation';
        rotationX.subtitle = 'Maximum spherical vertical tilt around the focused window. Default is 7.';
        this._bindIntSpin(settings, 'rotation-x', rotationX);

        const rotationY = Adw.SpinRow.new_with_range(0, 45, 1);
        rotationY.title = 'Y rotation';
        rotationY.subtitle = 'Maximum spherical side rotation around the focused window. Default is 9.';
        this._bindIntSpin(settings, 'rotation-y', rotationY);

        group.add(maxLayers);
        group.add(layerDistance);
        group.add(perspectiveStrength);
        group.add(useMagneticPush);
        group.add(magneticPush);
        group.add(adjustOnFocusedMove);
        group.add(useCylinderSwitcher);
        group.add(transparency);
        group.add(rotationX);
        group.add(rotationY);
        page.add(group);

        window.add(page);
        window.set_default_size(560, 460);
    }

    _bindIntSpin(settings, key, row) {
        row.value = settings.get_int(key);

        row.connect('notify::value', () => {
            const value = Math.round(row.value);
            if (settings.get_int(key) !== value)
                settings.set_int(key, value);
        });

        settings.connect(`changed::${key}`, () => {
            const value = settings.get_int(key);
            if (Math.round(row.value) !== value)
                row.value = value;
        });
    }

    _bindBoolSwitch(settings, key, row) {
        row.active = settings.get_boolean(key);

        row.connect('notify::active', () => {
            if (settings.get_boolean(key) !== row.active)
                settings.set_boolean(key, row.active);
        });

        settings.connect(`changed::${key}`, () => {
            const value = settings.get_boolean(key);
            if (row.active !== value)
                row.active = value;
        });
    }
}
