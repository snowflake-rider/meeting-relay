#!/bin/zsh
cd -- "${0:A:h}"
python3 setup_auto.py uninstall
printf '\nPress Enter to close.\n'
read
