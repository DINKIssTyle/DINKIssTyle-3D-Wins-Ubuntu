# DINKIssTyle 3D Wins

GNOME Shell extension that gives open windows a focus-history based 3D layer effect.

- The focused window stays at 100% size.
- Previously focused windows move to deeper visual layers.
- The oldest windows share the final layer.
- The desktop wallpaper is not changed.

## Options

- **Maximum layers**: defaults to `5`.
- **Distance between layers**: defaults to `70`.
- **Use magnetic push**: defaults to on.
- **Magnetic push**: defaults to `80`, which controls how far overlapping background windows are pushed away from the focused window while keeping some overlap.
- **Adjust surrounding windows while moving focused window**: defaults to off.
- **Use cylindrical Alt-Tab switcher**: defaults to on. Alt-Tab replaces the default system popup with a one-row 3D cylinder window switcher; each press moves one slot, Shift+Alt+Tab moves the opposite way, and releasing Alt activates the centered window.
- **Transparency**: defaults to `0`, which keeps all layers fully opaque. Higher values make deeper layers more transparent.
- **X rotation**: defaults to `7` degrees for the deepest layer.
- **Y rotation**: defaults to `9` degrees for the deepest layer.

For example, if maximum layers is `3`, layer 1 is the current focused window, layer 2 is the previously focused window, and layer 3 contains all remaining windows.

## Install Locally

Interactive installer:

```sh
./install.sh
```

Manual install:

```sh
make install
```

Then restart GNOME Shell or log out and back in, and enable:

```sh
gnome-extensions enable dkst-3d-wins@dinkisstyle.com
```

Open preferences with:

```sh
gnome-extensions prefs dkst-3d-wins@dinkisstyle.com
```
