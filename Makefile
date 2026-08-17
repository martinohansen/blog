.DEFAULT_GOAL := build

ESBUILD := npx --yes esbuild
ASSET_VERSION ?= $(shell git rev-list --abbrev-commit -1 HEAD 2>/dev/null)

.PHONY: build build-blog build-realkredit build-realkredit-index dev clean

build: build-blog build-realkredit

build-blog:
	./build.sh

build-realkredit: realkreditberegner/app.js build-realkredit-index

realkreditberegner/app.js: \
	realkreditberegner/app.jsx \
	realkreditberegner/data.js \
	realkreditberegner/calculations.js
	$(ESBUILD) realkreditberegner/app.jsx \
		--bundle \
		--format=iife \
		--global-name=RealkreditApp \
		--outfile=realkreditberegner/app.js \
		--loader:.jsx=jsx

build-realkredit-index: \
	realkreditberegner/index.template.html \
	realkreditberegner/app.js \
	scripts/render-versioned-html.mjs
	node scripts/render-versioned-html.mjs \
		realkreditberegner/index.template.html \
		realkreditberegner/index.html \
		$(ASSET_VERSION)

dev:
	./dev.sh
