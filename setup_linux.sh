#!/bin/bash

touch ~/.bashrc

MOCKNETSET=false

while read -r line
do
	if [[ "$line" =~ ^"alias mocknet="* ]]; then
		MOCKNETSET=true
	fi
done < ~/.bashrc

NEWLINESET=false

if [[ "$MOCKNETSET" != true ]]; then
	if [[ "$NEWLINESET" != true ]]; then
		echo '' >> ~/.bashrc
		NEWLINESET=true
	fi
	echo "Setting 'mocknet' alias";
	echo "alias mocknet='dt=\$(pwd); cd $(pwd); node --no-warnings MockNet.js -folderPath \$dt; cd \$dt;'" >> ~/.bashrc
fi

source ~/.bashrc

echo "Setup complete"