.DEFAULT_GOAL := build

ESBUILD := npx --yes esbuild

.PHONY: build build-blog build-realkredit dev clean

build: build-blog build-realkredit

build-blog:
	./build.sh

build-realkredit: realkreditberegner/app.js

realkreditberegner/app.js: realkreditberegner/app.jsx realkreditberegner/data.js realkreditberegner/calculations.js
	$(ESBUILD) realkreditberegner/app.jsx \
		--bundle \
		--format=iife \
		--global-name=RealkreditApp \
		--outfile=realkreditberegner/app.js \
		--loader:.jsx=jsx

dev:
	./dev.sh
