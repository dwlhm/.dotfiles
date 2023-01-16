#!/usr/bin/bash

# Jam
Clock() {
	DATETIME=$(date "+%Y-%m-%d, %T")

	echo -n "$DATETIME"
}

# Baterai
Battery() {
	BATPERC=$(acpi --battery | tr -s " " | cut -d, -f2 )

	echo -n "  bat.$BATPERC"
}

# Volume
Volume() {
	VOLPERC=$(pamixer --get-volume-human)	

	if [ "$VOLPERC" == "muted" ];then 
		VOLPREC="0"
	fi	
	echo -n "  vol. $VOLPERC"
}

# Internet
Internet() {
	NETSTATUS=$(nmcli -g common | grep -oF ' connected ')

	if [ -z $NETSTATUS ]; then
	       	NETSTATUS="offline"
        else
		NETSTATUS="online"
	fi

	echo -n "  net. $NETSTATUS "	
}

while true; do
	echo "%{c}%{B#FFFFFF} $(Clock) %{B-} %{r}%{B#000000}%{F#FFFFFF}$(Internet)%{F-}%{B-} %{B#000000}%{F#FFFFFF}$(Volume) %{F-}%{B-} %{B#000000}%{F#FFFFFF}$(Battery) %{F-}%{B-}"

	sleep 1&
	wait	
done
