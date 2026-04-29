UUID = dkst-3d-wins@dinkisstyle.com
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all schemas install uninstall pack clean

all: schemas

schemas:
	glib-compile-schemas schemas

install: schemas
	mkdir -p "$(INSTALL_DIR)"
	cp -r extension.js prefs.js metadata.json schemas "$(INSTALL_DIR)/"

uninstall:
	rm -rf "$(INSTALL_DIR)"

pack: schemas
	gnome-extensions pack --force --extra-source=schemas .

clean:
	rm -f schemas/gschemas.compiled *.shell-extension.zip
