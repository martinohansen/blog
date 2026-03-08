#!/bin/bash
set -euo pipefail

HEAD="_templates/head.html"
NAV="_templates/nav.html"
FOOTER="_templates/footer.html"

page() {
    local src=$1 out=$2 title=$3 page=$4
    echo "$out"
    pandoc "$src" \
        --from=html \
        --template="_templates/page.html" \
        --metadata title="$title" \
        --metadata page="$page" \
        --include-in-header="$HEAD" \
        --include-before-body="$NAV" \
        --include-after-body="$FOOTER" \
        --output="$out"
}

# Pages
page _pages/home.html index.html "Home" home
page _pages/blog.html blog/index.html "Blog" blog
page _pages/photos.html photos/index.html "Photos" photos

# Posts
while IFS= read -r md; do
    out="${md%.md}.html"
    echo "$out"
    pandoc "$md" \
        --template="_templates/post.html" \
        --include-in-header="$HEAD" \
        --include-before-body="$NAV" \
        --include-after-body="$FOOTER" \
        --output="$out"
done < <(find blog -name "*.md")
