function showConfirm(message, onConfirm) {
  const modal = document.getElementById("modal-confirm");
  const msgEl = document.getElementById("confirm-message");
  const yesBtn = document.getElementById("confirm-yes");
  const noBtn = document.getElementById("confirm-no");
  msgEl.textContent = message;
  modal.classList.remove("hidden");

  function cleanup() {
    modal.classList.add("hidden");
    yesBtn.removeEventListener("click", onYes);
    noBtn.removeEventListener("click", onNo);
  }
  function onYes() {
    cleanup();
    onConfirm();
  }
  function onNo() {
    cleanup();
  }
  yesBtn.addEventListener("click", onYes);
  noBtn.addEventListener("click", onNo);
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".form-confirm").forEach((form) => {
    form.addEventListener("submit", (e) => {
      if (form.dataset.confirmed) return;
      e.preventDefault();
      showConfirm(form.dataset.confirmMessage, () => {
        form.dataset.confirmed = "1";
        form.submit();
      });
    });
  });
});
