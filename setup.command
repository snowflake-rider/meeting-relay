#!/bin/zsh
cd -- "${0:A:h}"
python3 setup_auto.py install
printf '\nPress Enter to close.\n'
read
