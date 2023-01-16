#!/bin/bash

cd $(dirname -- $0)

. ./common.sh

fifo=${XDG_RUNTIME_DIR:-/tmp}/lemonbar.fifo
test -e $fifo && rm $fifo
mkfifo $fifo

trap 'pkill lemonbar; kill $(jobs -p)' EXIT

# Date
while :; do
	date "+DAT%a %d %b, %T" > $fifo
    sleep 1;
done &

# BSPWM desktops
while read -r line; do
    echo "DES$(bspc_desktops)" > $fifo
done < <(bspc subscribe desktop) &

# Brightness
while :; do
    echo "BRI$(xbacklight -get | cut -d'.' -f1)%" > $fifo
    sleep 0.5
done &

# Volume
while :; do
    current=$(pactl list sinks | awk '/\tVolume/ {print $5}')

    echo "VOL${current}" > $fifo

    sleep 0.5
done &

# Battery
while :; do
    echo "BAT$(acpi --battery | tr -s " " | cut -d, -f2 | sed -n 2p)" > $fifo
    sleep 10
done &

tail -f $fifo | $(dirname -- $0)/parser.sh | lemonbar \
	-g "x26+0+0" \
	-p \
	-B "${color_bg}" \
	-F "${color_fg}" \
	-f "xft:Droid Sans Mono:size=8" \
	-f "Font Awesome 6 Free:size=9" \
        -f "Font Awesome 6 Free Solid:size=9"	
