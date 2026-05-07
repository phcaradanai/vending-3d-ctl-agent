.PHONY: install start run check test

install:
	npm install

start:
	npm start

run:
	node apps.js

check:
	node --check apps.js
	node --check src/app.js
	node --check src/config/env.js
	node --check src/controllers/serial.controller.js
	node --check src/services/serial.service.js

test:
	npm test
