#!/bin/bash

CURR=$(< /sys/class/backlight/intel_backlight/brightness)
MAX=$(< /sys/class/backlight/intel_backlight/max_brightness)

case $1 in
	up)
		if [[ $CURR -lt $MAX ]]; then
			xbacklight -inc 5
		fi
		;;
	down)
		if [[ $CURR -gt 0 ]]; then
            xbacklight -dec 5
		fi
		;;
esac
