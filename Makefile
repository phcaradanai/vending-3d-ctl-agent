.PHONY: install start run check test

install:
	npm install

start:
	npm start

run:
	node index.js

check:
	node --check index.js
	node --check src/app.js
	node --check src/config/env.js
	node --check src/controllers/serial.controller.js
	node --check src/controllers/adm.controller.js
	node --check src/services/serial.service.js
	node --check src/middleware/validateAdmControl.middleware.js

test:
	npm test
