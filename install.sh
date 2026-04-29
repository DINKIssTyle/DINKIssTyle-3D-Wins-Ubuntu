#!/bin/sh

set -eu

UUID="dkst-3d-wins@dinkisstyle.com"

print_menu() {
    printf '\n'
    printf 'DINKIssTyle 3D Wins Installer\n'
    printf '==============================\n'
    printf '1. Install\n'
    printf '2. Uninstall\n'
    printf '3. Exit\n'
    printf '\n'
    printf 'Select an option: '
}

install_extension() {
    printf '\nInstalling %s...\n' "$UUID"
    make install
    printf '\nInstallation complete.\n'
    printf 'Restart GNOME Shell or log out and back in, then run:\n'
    printf '  gnome-extensions enable %s\n' "$UUID"
}

uninstall_extension() {
    printf '\nUninstalling %s...\n' "$UUID"
    make uninstall
    printf '\nUninstall complete.\n'
    printf 'Restart GNOME Shell or log out and back in if the extension was active.\n'
}

while :; do
    print_menu
    read -r choice

    case "$choice" in
        1)
            install_extension
            ;;
        2)
            uninstall_extension
            ;;
        3)
            printf '\nGoodbye.\n'
            exit 0
            ;;
        *)
            printf '\nInvalid option. Please choose 1, 2, or 3.\n'
            ;;
    esac
done
