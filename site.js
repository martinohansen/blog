(() => {
  const copyTimers = new WeakMap();

  function fallbackCopy(text) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();

    if (!copied) throw new Error("The browser rejected the copy command.");
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    fallbackCopy(text);
  }

  function setCopyState(button, state) {
    const previousTimer = copyTimers.get(button);
    if (previousTimer) clearTimeout(previousTimer);

    const copied = state === "copied";
    let label = "Copy code";
    if (copied) label = "Code copied";
    if (state === "error") label = "Could not copy code";

    button.classList.toggle("is-copied", copied);
    button.setAttribute("aria-label", label);
    button.title = label;
    button.querySelector(".code-copy-status").textContent =
      copied ? "Copied" : state === "error" ? "Copy failed" : "";

    if (state !== "idle") {
      copyTimers.set(
        button,
        setTimeout(() => setCopyState(button, "idle"), 2000),
      );
    }
  }

  function copyButton(code) {
    const button = document.createElement("button");
    button.className = "code-copy-button";
    button.type = "button";
    button.setAttribute("aria-label", "Copy code");
    button.title = "Copy code";
    button.innerHTML = `
      <svg class="copy-icon" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="6.25" y="6.25" width="8.25" height="8.25" rx="1.25"></rect>
        <path d="M11.75 6.25V4.75c0-.69-.56-1.25-1.25-1.25H4.75c-.69 0-1.25.56-1.25 1.25v5.75c0 .69.56 1.25 1.25 1.25h1.5"></path>
      </svg>
      <svg class="copy-success-icon" viewBox="0 0 18 18" aria-hidden="true">
        <path d="m3.75 9.25 3.25 3.25 7.25-7.25"></path>
      </svg>
      <span class="code-copy-status" role="status" aria-live="polite"></span>
    `;
    button.addEventListener("click", async () => {
      try {
        await copyText(code.textContent);
        setCopyState(button, "copied");
      } catch {
        setCopyState(button, "error");
      }
    });
    return button;
  }

  function addCopyButtons() {
    document.querySelectorAll("main pre").forEach((pre) => {
      const code = pre.firstElementChild;
      if (!code?.matches("code")) return;

      let container = pre.parentElement;
      if (!container?.classList.contains("sourceCode")) {
        container = document.createElement("div");
        pre.before(container);
        container.append(pre);
      }

      container.classList.add("code-block");
      container.append(copyButton(code));
    });
  }

  addCopyButtons();
})();
