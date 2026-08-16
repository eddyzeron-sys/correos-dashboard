const RANDOM_FIRST_NAMES = [
  "juan", "luis", "carlos", "jose", "miguel", "pedro", "diego", "andres",
  "fernando", "ricardo", "javier", "roberto", "eduardo", "manuel", "alberto",
  "maria", "ana", "laura", "sofia", "carmen", "patricia", "andrea", "daniela",
  "gabriela", "valeria", "monica", "claudia", "lucia", "paola", "vanessa",
];
const RANDOM_LAST_NAMES = [
  "perez", "lopez", "garcia", "martinez", "rodriguez", "hernandez", "gonzalez",
  "sanchez", "ramirez", "torres", "flores", "rivera", "gomez", "diaz",
  "reyes", "morales", "cruz", "ortiz", "castillo", "romero", "alvarez",
  "mendoza", "vargas", "castro", "rojas", "medina", "aguilar", "guerrero",
];

function randomLocalPart() {
  const first = RANDOM_FIRST_NAMES[Math.floor(Math.random() * RANDOM_FIRST_NAMES.length)];
  const last = RANDOM_LAST_NAMES[Math.floor(Math.random() * RANDOM_LAST_NAMES.length)];
  return first + last;
}

function tagCardHtml(id, name, color, checked) {
  const greenActive = color === "#16a34a" ? " active" : "";
  const redActive = color === "#dc2626" ? " active" : "";
  return (
    '<div class="tag-card' + (checked ? " selected" : "") + '" data-tag-id="' + id + '">' +
    '<label class="tag-card-name">' +
    '<input type="checkbox" name="tag_ids" value="' + id + '" data-tag-checkbox' + (checked ? " checked" : "") + " />" +
    '<span class="dot" style="background: ' + color + '"></span>' + name +
    "</label>" +
    '<div class="tag-card-actions">' +
    '<button type="button" class="tag-card-btn color-dot-btn' + greenActive + '" data-color="#16a34a" title="Habilitada" style="background:#16a34a"></button>' +
    '<button type="button" class="tag-card-btn color-dot-btn' + redActive + '" data-color="#dc2626" title="Bloqueada" style="background:#dc2626"></button>' +
    '<button type="button" class="tag-card-btn tag-del-btn" data-tag-id="' + id + '" data-tag-name="' + name + '" title="Eliminar etiqueta">✕</button>' +
    "</div>" +
    "</div>"
  );
}

function tagCardHtmlSimple(id, name, color) {
  return (
    '<div class="tag-card"><label class="tag-card-name">' +
    '<input type="checkbox" name="tag_ids" value="' + id + '" data-tag-checkbox />' +
    '<span class="dot" style="background: ' + color + '"></span>' + name +
    "</label></div>"
  );
}

// fetch() que le avisa al servidor que es una petición AJAX (para que responda
// 401 en JSON si la sesión expiró, en vez de redirigir a /login como HTML).
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
  const params = new URLSearchParams(location.search);
  if (params.get("deleted") === "1") {
    showToast("Correo eliminado correctamente");
    params.delete("deleted");
    const newSearch = params.toString();
    history.replaceState(null, "", location.pathname + (newSearch ? `?${newSearch}` : ""));
  }

  const modalAdd = document.getElementById("modal-add");
  const modalEdit = document.getElementById("modal-edit");
  const btnAdd = document.getElementById("btn-add");
  const localPartField = document.getElementById("local-part-field");
  const btnRandomName = document.getElementById("btn-random-name");
  const editEmailLabel = document.getElementById("edit-email-label");
  const formEditTags = document.getElementById("form-edit-tags");
  const editTagChecklist = document.getElementById("edit-tag-checklist");
  const addTagChecklist = document.getElementById("add-tag-checklist");
  const newTagName = document.getElementById("new-tag-name");
  const newTagColorPicker = document.getElementById("new-tag-color-picker");

  // Clic en el nombre de una etiqueta (dentro de una tarjeta) resalta la
  // tarjeta como "seleccionada" — reemplaza al checkbox visible.
  function wireTagCardSelection(container) {
    if (!container) return;
    container.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-tag-checkbox]");
      if (!cb) return;
      cb.closest(".tag-card").classList.toggle("selected", cb.checked);
    });
  }
  wireTagCardSelection(editTagChecklist);
  wireTagCardSelection(addTagChecklist);

  document.querySelectorAll(".btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalAdd.classList.add("hidden");
      modalEdit.classList.add("hidden");
    });
  });

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      localPartField.value = "";
      modalAdd.classList.remove("hidden");
    });
  }

  if (btnRandomName) {
    btnRandomName.addEventListener("click", () => {
      localPartField.value = randomLocalPart();
    });
  }

  document.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const email = btn.dataset.email;
      const assignedIds = (btn.dataset.tagIds || "").split(",").filter(Boolean);
      editEmailLabel.textContent = email;
      formEditTags.action = `/email-accounts/${id}/tags`;
      editTagChecklist.querySelectorAll("[data-tag-checkbox]").forEach((cb) => {
        const isChecked = assignedIds.includes(cb.value);
        cb.checked = isChecked;
        cb.closest(".tag-card").classList.toggle("selected", isChecked);
      });
      modalEdit.classList.remove("hidden");
    });
  });

  // Crear etiqueta nueva: escribe el nombre y da clic directo en el color.
  if (newTagColorPicker) {
    newTagColorPicker.querySelectorAll(".color-dot-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = newTagName.value.trim();
        if (!name) {
          newTagName.focus();
          return;
        }
        const color = btn.dataset.color;
        apiFetch("/tags", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `name=${encodeURIComponent(name)}&color=${encodeURIComponent(color)}`,
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.error) {
              alert(data.error);
              return;
            }
            const emptyMsg = document.getElementById("edit-tag-empty-msg");
            if (emptyMsg) emptyMsg.remove();
            editTagChecklist.insertAdjacentHTML("beforeend", tagCardHtml(data.id, data.name, data.color, true));
            if (addTagChecklist) {
              addTagChecklist.insertAdjacentHTML("beforeend", tagCardHtmlSimple(data.id, data.name, data.color));
            }
            newTagName.value = "";
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") alert("No se pudo crear la etiqueta.");
          });
      });
    });
  }

  // Cambiar color (habilitada/bloqueada) de una etiqueta ya existente: clic
  // directo en el punto que quieras, dentro de su tarjeta.
  editTagChecklist.addEventListener("click", (e) => {
    const btn = e.target.closest(".color-dot-btn");
    if (!btn) return;
    if (btn.classList.contains("active")) return;
    const card = btn.closest(".tag-card");
    if (!card) return;
    const tagId = card.dataset.tagId;
    const color = btn.dataset.color;
    apiFetch(`/tags/${tagId}/color`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `color=${encodeURIComponent(color)}`,
    })
      .then((r) => r.json())
      .then(() => location.reload())
      .catch((err) => {
        if (err.message !== "unauthenticated") alert("No se pudo cambiar el color.");
      });
  });

  // Eliminar una etiqueta por completo (se quita de todos los correos que la tengan).
  editTagChecklist.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag-del-btn");
    if (!btn) return;
    showConfirm(`¿Eliminar la etiqueta "${btn.dataset.tagName}"? Se quita de todos tus correos.`, () => {
      apiFetch(`/tags/${btn.dataset.tagId}/delete`, { method: "POST" })
        .then((r) => r.json())
        .then(() => location.reload())
        .catch((err) => {
          if (err.message !== "unauthenticated") alert("No se pudo eliminar la etiqueta.");
        });
    });
  });

  document.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const email = btn.dataset.email;
      const done = () => showToast("Correo copiado: " + email);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done).catch(() => fallbackCopy(email, done));
      } else {
        fallbackCopy(email, done);
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

  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      btnRefresh.disabled = true;
      btnRefresh.classList.add("loading");
      apiFetch("/email-accounts/check-new", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          let totalNew = 0;
          (data.results || []).forEach((r) => {
            const badge = document.getElementById(`new-badge-${r.id}`);
            if (!badge) return;
            if (r.unseen > 0) {
              badge.querySelector(".count").textContent = r.unseen;
              badge.classList.remove("hidden");
              totalNew += r.unseen;
            } else {
              badge.classList.add("hidden");
            }
          });
          showToast(totalNew > 0 ? `Hay ${totalNew} correo(s) nuevo(s)` : "No hay correos nuevos");
          applyEmailFilters();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo actualizar.");
        })
        .finally(() => {
          btnRefresh.disabled = false;
          btnRefresh.classList.remove("loading");
        });
    });
  }

  // Buscador + filtro de la lista de correos (con mensajes nuevos / recientes / A-Z).
  const emailSearch = document.getElementById("email-search");
  const emailFilter = document.getElementById("email-filter");
  const emailList = document.querySelector(".list");

  function applyEmailFilters() {
    if (!emailList) return;
    const query = ((emailSearch && emailSearch.value) || "").trim().toLowerCase();
    const mode = (emailFilter && emailFilter.value) || "all";
    const rows = Array.from(emailList.querySelectorAll(".email-row"));

    rows.forEach((row) => {
      const email = (row.dataset.email || "").toLowerCase();
      let visible = !query || email.includes(query);
      if (visible && mode === "new") {
        const badge = row.querySelector(".new-mail-badge");
        visible = !!badge && !badge.classList.contains("hidden");
      }
      row.style.display = visible ? "" : "none";
    });

    const sorted = rows.slice();
    if (mode === "recent") {
      sorted.sort((a, b) => (b.dataset.created || "").localeCompare(a.dataset.created || ""));
    } else {
      sorted.sort((a, b) => (a.dataset.email || "").localeCompare(b.dataset.email || ""));
    }
    sorted.forEach((row) => emailList.appendChild(row));
  }

  if (emailSearch) emailSearch.addEventListener("input", applyEmailFilters);
  if (emailFilter) {
    emailFilter.addEventListener("change", () => {
      if (emailFilter.value === "new" && btnRefresh) {
        btnRefresh.click();
        return;
      }
      applyEmailFilters();
    });
  }

  // Confirmación propia (en vez del confirm() nativo del navegador) para borrar un correo.
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
