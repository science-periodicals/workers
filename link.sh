#!/usr/bin/env bash

(cd ../dedocx && npm link)
(cd ../librarian && npm link)

npm link @scipe/dedocx @scipe/librarian
