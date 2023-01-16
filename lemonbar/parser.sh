#!/bin/bash

cd $(dirname -- $0)

. ./common.sh

desktop="$(bspc_desktops)"

while read -r line; do
    case $line in
        DAT*)
            date="%{B${color_hl1}}   ${line#???}   %{B-}"
            ;;
        DES*)
            desktop="${line#???}"
            ;;
        BRI*)
            brightness="%{F#025db7}\ue57a%{F-}   ${line#???}"
            ;;
        VOL*)
            volume="%{F#025db7}\uf025%{F-}  ${line#???}"
            ;;
        BAT*)
            battery="%{F#025db7}\uf5df%{F-}  ${line#???}"
            ;;
        *) ;;
    esac

    echo -e "%{S1}%{l}${desktop}%{r}${brightness}     ${volume}     ${battery}     ${date}%{S0}%{l}${date}     ${battery}     ${volume}     ${brightness} %{r}                                    ${desktop}  "
done

