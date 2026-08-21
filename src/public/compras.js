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
  const modalAdd = document.getElementById("modal-add-email");
  const modalEdit = document.getElementById("modal-edit-email");
  const btnAdd = document.getElementById("btn-add-email");
  const addEmailField = document.getElementById("add-email-field");
  const formAddEmail = document.getElementById("form-add-email");
  const editEmailField = document.getElementById("edit-email-field");
  const formEditEmail = document.getElementById("form-edit-email");

  document.querySelectorAll(".btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalAdd.classList.add("hidden");
      modalEdit.classList.add("hidden");
      document.getElementById("modal-add-compra").classList.add("hidden");
    });
  });

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      addEmailField.value = "";
      modalAdd.classList.remove("hidden");
      addEmailField.focus();
    });
  }

  if (formAddEmail) {
    formAddEmail.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = addEmailField.value.trim();
      if (!email) return;
      apiFetch("/compras/emails", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(email)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          location.reload();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo agregar el correo.");
        });
    });
  }

  document.querySelectorAll(".btn-edit-email").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      formEditEmail.dataset.id = btn.dataset.id;
      editEmailField.value = btn.dataset.email;
      modalEdit.classList.remove("hidden");
      editEmailField.focus();
    });
  });

  if (formEditEmail) {
    formEditEmail.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = formEditEmail.dataset.id;
      const email = editEmailField.value.trim();
      if (!email) return;
      apiFetch(`/compras/emails/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(email)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          location.reload();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar el correo.");
        });
    });
  }

  document.querySelectorAll(".btn-delete-email").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showConfirm(`¿Eliminar ${btn.dataset.email}?`, () => {
        apiFetch(`/compras/emails/${btn.dataset.id}/delete`, { method: "POST" })
          .then((r) => r.json())
          .then(() => {
            const card = btn.closest(".compra-email-card");
            if (card) {
              if (card.classList.contains("active")) showComprasPanelEmpty();
              card.remove();
            }
            showToast("Correo eliminado");
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") showToast("No se pudo eliminar el correo.");
          });
      });
    });
  });

  // ---------- Selección de correo + registro de compras ----------
  const comprasPanel = document.getElementById("compras-panel");
  const modalAddCompra = document.getElementById("modal-add-compra");
  const formAddCompra = document.getElementById("form-add-compra");
  const compraCorreoField = document.getElementById("compra-correo-field");
  const compraTarjetaField = document.getElementById("compra-tarjeta-field");
  const compraMontoHint = document.getElementById("compra-monto-hint");
  const compraTagsChecklist = document.getElementById("compra-tags-checklist");
  const newCompraTagName = document.getElementById("new-compra-tag-name");
  const btnAddCompraTag = document.getElementById("btn-add-compra-tag");

  let selectedEmailId = null;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Los montos NUNCA se suman — se listan tal cual se ingresaron, separados
  // por coma. "15,59" se muestra como "$15.00, $59.00".
  function formatMontos(montosStr) {
    if (!montosStr) return "—";
    return montosStr
      .split(",")
      .map((v) => "$" + Number(v).toFixed(2))
      .join(", ");
  }

  // Cache de los últimos registros cargados (id -> objeto completo con sus
  // tiendas), para poder abrir el modal de edición sin tener que codificar
  // listas anidadas en atributos data-*.
  let registroDataById = new Map();

  function registroCardHtml(r) {
    registroDataById.set(r.id, r);
    const tiendaLines = r.tiendas.length
      ? r.tiendas
          .map(
            (t) =>
              '<div class="compra-tienda-line"><b>' +
              (t.tag_name ? escapeHtml(t.tag_name) : "—") +
              ":</b> " +
              formatMontos(t.montos) +
              "</div>"
          )
          .join("")
      : '<div class="compra-tienda-line muted">Sin tienda</div>';
    return (
      '<div class="compra-registro-card" data-id="' + r.id + '">' +
      '<button type="button" class="btn-remove-registro" data-id="' + r.id + '" title="Eliminar">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      '<div class="compra-registro-top"><span class="field-label">Tarjeta</span><span class="field-value">' +
      (r.tarjeta ? escapeHtml(r.tarjeta) : "—") +
      "</span></div>" +
      '<div class="compra-tiendas-lines">' +
      tiendaLines +
      "</div>" +
      '<div class="compra-registro-correo"><span class="field-label">Correo</span><span class="field-value">' +
      escapeHtml(r.correo || "") +
      "</span></div>" +
      "</div>"
    );
  }

  function wireRegistroDeleteButtons() {
    comprasPanel.querySelectorAll(".btn-remove-registro").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirm("¿Eliminar esta compra registrada?", () => {
          apiFetch(`/compras/registros/${btn.dataset.id}/delete`, { method: "POST" })
            .then((r) => r.json())
            .then(() => {
              const card = btn.closest(".compra-registro-card");
              if (card) card.remove();
              showToast("Compra eliminada");
            })
            .catch((err) => {
              if (err.message !== "unauthenticated") showToast("No se pudo eliminar.");
            });
        });
      });
    });
  }

  function wireRegistroCardClicks() {
    comprasPanel.querySelectorAll(".compra-registro-card").forEach((card) => {
      card.addEventListener("click", () => {
        const data = registroDataById.get(Number(card.dataset.id));
        if (data) openCompraModal(data);
      });
    });
  }

  function showComprasPanelEmpty() {
    selectedEmailId = null;
    comprasPanel.innerHTML = '<div class="list-empty">Selecciona un correo a la izquierda para ver su registro de compras.</div>';
  }

  function renderRegistros(registros) {
    registroDataById = new Map();
    const listHtml = registros.length
      ? '<div class="compra-registros-list">' + registros.map(registroCardHtml).join("") + "</div>"
      : '<div class="list-empty">Todavía no hay compras registradas para este correo.</div>';

    comprasPanel.innerHTML =
      '<div class="compras-panel-header"><h2>Registro de compras</h2>' +
      '<button type="button" id="btn-add-compra" class="btn-cta btn-icon-only" title="Agregar compra">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button></div>' +
      listHtml;

    document.getElementById("btn-add-compra").addEventListener("click", () => openCompraModal(null));
    wireRegistroDeleteButtons();
    wireRegistroCardClicks();
  }

  function loadRegistrosFor(id) {
    selectedEmailId = id;
    comprasPanel.innerHTML = '<div class="list-empty">Cargando…</div>';
    apiFetch(`/compras/emails/${id}/registros`)
      .then((r) => r.json())
      .then((data) => renderRegistros(data.registros || []))
      .catch((err) => {
        if (err.message !== "unauthenticated") showToast("No se pudo cargar el registro.");
      });
  }

  document.querySelectorAll(".compra-email-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".compra-email-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      loadRegistrosFor(card.dataset.id);
    });
  });

  // ---------- Modal "Agregar/editar compra" ----------
  // La tienda es multi-selección — cada tienda elegida tiene su propio grupo
  // con una o más cantidades. Las cantidades NUNCA se suman: se guardan y se
  // muestran tal cual se escribieron ("Depop: $15, $59"). Al guardar se crea
  // (o edita) UNA compra por tienda, con la lista completa de sus montos.
  const compraMontoGroups = document.getElementById("compra-monto-groups");
  const modalTitle = document.getElementById("modal-add-compra-title");
  const btnSubmitCompra = document.getElementById("btn-submit-compra");
  let editingRegistroId = null;

  function montoRowHtml() {
    return (
      '<div class="row compra-monto-row">' +
      '<span class="muted" style="font-weight:700;">$</span>' +
      '<input type="number" class="compra-monto-input" step="0.01" min="0" placeholder="0.00" />' +
      '<button type="button" class="icon-action danger-hover btn-remove-monto-in-group" title="Quitar esta cantidad">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      "</div>"
    );
  }

  function updateRemoveButtonsVisibility(group) {
    const rows = group.querySelectorAll(".compra-monto-row");
    rows.forEach((row) => {
      const btn = row.querySelector(".btn-remove-monto-in-group");
      if (btn) btn.style.display = rows.length > 1 ? "" : "none";
    });
  }

  function collectGroupMontos(group) {
    return Array.from(group.querySelectorAll(".compra-monto-input"))
      .map((i) => i.value.trim())
      .filter((v) => v !== "");
  }

  function updateMontoPlaceholder() {
    const hasGroups = compraMontoGroups.children.length > 0;
    if (compraMontoHint) compraMontoHint.style.display = hasGroups ? "none" : "";
  }

  // initialValues: lista de montos ya guardados para esta tienda (editar), o
  // [] para empezar con una fila vacía (crear).
  function addMontoGroup(tagId, tagName, initialValues) {
    const div = document.createElement("div");
    div.className = "compra-monto-group";
    div.dataset.tagId = tagId;
    div.dataset.tagName = tagName;
    const values = initialValues && initialValues.length ? initialValues : [null];
    div.innerHTML =
      '<div class="compra-monto-group-header"><span>' +
      escapeHtml(tagName) +
      '</span></div><div class="compra-monto-rows">' +
      values.map(() => montoRowHtml()).join("") +
      '</div><button type="button" class="link btn-add-monto-group-row">+ Agregar otra cantidad</button>';
    compraMontoGroups.appendChild(div);
    const inputs = div.querySelectorAll(".compra-monto-input");
    values.forEach((v, i) => {
      if (v !== null && v !== undefined && v !== "") inputs[i].value = v;
    });
    updateRemoveButtonsVisibility(div);
    updateMontoPlaceholder();
    return div;
  }

  function removeMontoGroup(tagId) {
    const group = compraMontoGroups.querySelector('.compra-monto-group[data-tag-id="' + tagId + '"]');
    if (group) group.remove();
    updateMontoPlaceholder();
  }

  compraMontoGroups.addEventListener("click", (e) => {
    const addBtn = e.target.closest(".btn-add-monto-group-row");
    if (addBtn) {
      const group = addBtn.closest(".compra-monto-group");
      group.querySelector(".compra-monto-rows").insertAdjacentHTML("beforeend", montoRowHtml());
      updateRemoveButtonsVisibility(group);
      return;
    }
    const removeBtn = e.target.closest(".btn-remove-monto-in-group");
    if (removeBtn) {
      const group = removeBtn.closest(".compra-monto-group");
      removeBtn.closest(".compra-monto-row").remove();
      updateRemoveButtonsVisibility(group);
    }
  });

  // existing === null → modo agregar. existing === {id, correo, tarjeta,
  // tiendas: [{tag_id, tag_name, montos}, ...]} → modo editar, con todas sus
  // tiendas precargadas y editables juntas (una sola tarjeta para todo).
  function openCompraModal(existing) {
    editingRegistroId = existing ? existing.id : null;
    modalTitle.textContent = existing ? "Editar compra" : "Agregar compra";
    btnSubmitCompra.textContent = existing ? "Guardar cambios" : "Guardar compra";
    compraCorreoField.value = existing ? existing.correo : "";
    compraTarjetaField.value = existing ? existing.tarjeta || "" : "";
    newCompraTagName.value = "";
    compraMontoGroups.innerHTML = "";
    compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));

    if (existing) {
      existing.tiendas.forEach((t) => {
        const card = compraTagsChecklist.querySelector('.tag-card[data-tag-id="' + t.tag_id + '"]');
        if (!card) return;
        card.classList.add("selected");
        const values = (t.montos || "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "");
        addMontoGroup(t.tag_id, card.querySelector(".tag-card-name").textContent.trim(), values);
      });
    }
    updateMontoPlaceholder();
    modalAddCompra.classList.remove("hidden");
  }

  // La tienda es multi-selección tanto al crear como al editar — una tarjeta
  // de compra puede agrupar varias tiendas a la vez, cada una con su propio
  // grupo de cantidades, sin perder lo ya escrito en las demás.
  compraTagsChecklist.addEventListener("click", (e) => {
    const card = e.target.closest(".tag-card");
    if (!card) return;
    const tagId = card.dataset.tagId;
    const tagName = card.querySelector(".tag-card-name").textContent.trim();

    const nowSelected = !card.classList.contains("selected");
    card.classList.toggle("selected", nowSelected);
    if (nowSelected) {
      addMontoGroup(tagId, tagName, []);
    } else {
      removeMontoGroup(tagId);
    }
  });

  if (btnAddCompraTag) {
    btnAddCompraTag.addEventListener("click", () => {
      const name = newCompraTagName.value.trim();
      if (!name) {
        newCompraTagName.focus();
        return;
      }
      apiFetch("/compras/tags", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `name=${encodeURIComponent(name)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          const emptyMsg = document.getElementById("compra-tags-empty-msg");
          if (emptyMsg) emptyMsg.remove();
          compraTagsChecklist.insertAdjacentHTML(
            "beforeend",
            '<div class="tag-card" data-tag-id="' + data.id + '"><span class="tag-card-name">' +
              escapeHtml(data.name) +
              "</span></div>"
          );
          const newCard = compraTagsChecklist.lastElementChild;
          newCard.classList.add("selected");
          addMontoGroup(data.id, data.name, []);
          newCompraTagName.value = "";
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo crear la etiqueta.");
        });
    });
  }

  function insertRegistroCard(registro) {
    const emptyState = comprasPanel.querySelector(".list-empty");
    if (emptyState) {
      comprasPanel
        .querySelector(".compras-panel-header")
        .insertAdjacentHTML("afterend", '<div class="compra-registros-list"></div>');
      emptyState.remove();
    }
    comprasPanel.querySelector(".compra-registros-list").insertAdjacentHTML("afterbegin", registroCardHtml(registro));
  }

  if (formAddCompra) {
    formAddCompra.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!selectedEmailId) return;
      const correo = compraCorreoField.value.trim();
      if (!correo) {
        compraCorreoField.focus();
        return;
      }
      const tarjeta = compraTarjetaField.value.trim();
      const groups = Array.from(compraMontoGroups.querySelectorAll(".compra-monto-group"));
      if (!groups.length) {
        showToast("Elige al menos una tienda.");
        return;
      }

      // Una sola tarjeta agrupa todas las tiendas elegidas — cada una con su
      // lista de montos tal cual se escribieron (sin sumar).
      const tiendas = groups.map((group) => ({
        tag_id: group.dataset.tagId,
        montos: collectGroupMontos(group).join(","),
      }));
      const payload = { compra_email_id: selectedEmailId, correo, tarjeta, tiendas };
      const url = editingRegistroId ? `/compras/registros/${editingRegistroId}` : "/compras/registros";

      apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          modalAddCompra.classList.add("hidden");
          if (editingRegistroId) {
            const existingCard = comprasPanel.querySelector(
              '.compra-registro-card[data-id="' + editingRegistroId + '"]'
            );
            if (existingCard) existingCard.outerHTML = registroCardHtml(data.registro);
          } else {
            const emptyState = comprasPanel.querySelector(".list-empty");
            if (emptyState) {
              comprasPanel
                .querySelector(".compras-panel-header")
                .insertAdjacentHTML("afterend", '<div class="compra-registros-list"></div>');
              emptyState.remove();
            }
            comprasPanel
              .querySelector(".compra-registros-list")
              .insertAdjacentHTML("afterbegin", registroCardHtml(data.registro));
          }
          wireRegistroDeleteButtons();
          wireRegistroCardClicks();
          showToast(editingRegistroId ? "Compra actualizada" : "Compra agregada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar la compra.");
        });
    });
  }
});
