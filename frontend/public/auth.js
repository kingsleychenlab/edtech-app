const form = document.querySelector("[data-auth-form]");

document.querySelectorAll(".password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.textContent = isHidden ? "Hide" : "Show";
    button.setAttribute("aria-label", `${isHidden ? "Hide" : "Show"} password`);
  });
});

document.querySelectorAll("[data-provider]").forEach((button) => {
  button.addEventListener("click", async () => {
    setBusy(button, true);
    try {
      const response = await fetch("/api/auth/provider", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: button.dataset.provider })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.href = "../app/index.html";
    } catch (error) {
      showNote(error.message || "Social sign-in is unavailable.");
      setBusy(button, false);
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const values = Object.fromEntries(new FormData(form));
  const mode = form.dataset.authForm;
  const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";

  setBusy(submit, true);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    showNote("Opening your workspace...");
    window.location.href = "../app/index.html";
  } catch (error) {
    showNote(error.message || "Something went wrong. Please try again.");
    setBusy(submit, false);
  }
});

function setBusy(button, busy) {
  button.disabled = busy;
  button.style.opacity = busy ? "0.65" : "";
  button.style.cursor = busy ? "wait" : "";
}

function showNote(message) {
  let note = document.querySelector(".auth-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "auth-note";
    note.setAttribute("role", "status");
    form.insertAdjacentElement("afterend", note);
  }
  note.textContent = message;
}
