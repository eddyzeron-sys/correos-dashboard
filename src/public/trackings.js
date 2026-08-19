function apiFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({ "X-Requested-With": "XMLHttpRequest" }, options.headers || {});
  return fetch(url, options).then((res) => {
    if (res.status === 401) {
      showToast("Tu sesión expiró. Recargando...");
      setTimeout(() => (location.href = "/login"), 1500);
      throw new Error("unauthenticated");
    }
    return res;
  });
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

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
  const btnScan = document.getElementById("btn-scan-trackings");
  if (btnScan) {
    btnScan.addEventListener("click", () => {
      btnScan.disabled = true;
      btnScan.classList.add("loading");
      apiFetch("/trackings/scan", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (data.found > 0) {
            showToast(`Se encontraron ${data.found} tracking(s) nuevo(s)`);
            location.reload();
          } else {
            showToast("No hay trackings nuevos");
          }
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo buscar trackings.");
        })
        .finally(() => {
          btnScan.disabled = false;
          btnScan.classList.remove("loading");
        });
    });
  }

  document.querySelectorAll(".btn-copy-tracking").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tracking = btn.dataset.tracking;
      const done = () => showToast("Copiado: " + tracking);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tracking).then(done).catch(() => fallbackCopy(tracking, done));
      } else {
        fallbackCopy(tracking, done);
      }
    });
  });

  function fallbackCopy(text, done) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {
      // no-op
    }
    document.body.removeChild(el);
  }

  document.querySelectorAll(".btn-delete-tracking").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm("¿Quitar este tracking de la lista?", () => {
        apiFetch(`/trackings/${btn.dataset.id}/delete`, { method: "POST" })
          .then((r) => r.json())
          .then(() => {
            const row = btn.closest(".list-row");
            if (row) row.remove();
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") showToast("No se pudo quitar el tracking.");
          });
      });
    });
  });
});
