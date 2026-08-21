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

  // Cierra el modal que contiene al botón, sea cual sea — así los modales
  // nuevos no necesitan que se les agregue aquí a mano (bug ya visto antes).
  document.querySelectorAll(".btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      if (modal) modal.classList.add("hidden");
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

  // ---------- Pestañas de página: Registro de compras / Mis tarjetas ----------
  const pageTabBtns = document.querySelectorAll(".page-tab-btn");
  const pageTabPanels = document.querySelectorAll(".page-tab-panel");
  pageTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      pageTabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      pageTabPanels.forEach((p) => p.classList.toggle("hidden", p.dataset.pageTabPanel !== btn.dataset.pageTab));
    });
  });

  // ---------- "Mis tarjetas" (libreta de tarjetas guardadas) ----------
  const modalAddTarjeta = document.getElementById("modal-add-tarjeta");
  const modalEditTarjeta = document.getElementById("modal-edit-tarjeta");
  const btnAddTarjeta = document.getElementById("btn-add-tarjeta");
  const addTarjetaField = document.getElementById("add-tarjeta-field");
  const formAddTarjeta = document.getElementById("form-add-tarjeta");
  const editTarjetaField = document.getElementById("edit-tarjeta-field");
  const formEditTarjeta = document.getElementById("form-edit-tarjeta");
  const tarjetasList = document.getElementById("compras-tarjetas-list");

  function tarjetaCardHtml(t) {
    return (
      '<div class="compra-tarjeta-card" data-id="' + t.id + '" data-tarjeta="' + escapeHtml(t.tarjeta) + '">' +
      '<span class="compra-tarjeta-text">' + escapeHtml(t.tarjeta) + "</span>" +
      '<div class="icon-actions-group">' +
      '<button type="button" class="icon-action btn-edit-tarjeta" title="Editar" data-id="' + t.id + '" data-tarjeta="' + escapeHtml(t.tarjeta) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>' +
      '<button type="button" class="icon-action danger-hover btn-delete-tarjeta" title="Eliminar" data-id="' + t.id + '" data-tarjeta="' + escapeHtml(t.tarjeta) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
      '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg></button>' +
      "</div></div>"
    );
  }

  function wireTarjetaCardButtons() {
    tarjetasList.querySelectorAll(".btn-edit-tarjeta").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        formEditTarjeta.dataset.id = btn.dataset.id;
        editTarjetaField.value = btn.dataset.tarjeta;
        modalEditTarjeta.classList.remove("hidden");
        editTarjetaField.focus();
      });
    });
    tarjetasList.querySelectorAll(".btn-delete-tarjeta").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirm(`¿Eliminar la tarjeta "${btn.dataset.tarjeta}"?`, () => {
          apiFetch(`/compras/tarjetas/${btn.dataset.id}/delete`, { method: "POST" })
            .then((r) => r.json())
            .then(() => {
              const card = btn.closest(".compra-tarjeta-card");
              if (card) card.remove();
              if (!tarjetasList.querySelector(".compra-tarjeta-card")) {
                tarjetasList.innerHTML = '<div class="list-empty">Todavía no has guardado ninguna tarjeta.</div>';
              }
              showToast("Tarjeta eliminada");
            })
            .catch((err) => {
              if (err.message !== "unauthenticated") showToast("No se pudo eliminar la tarjeta.");
            });
        });
      });
    });
  }

  if (tarjetasList) wireTarjetaCardButtons();

  if (btnAddTarjeta) {
    btnAddTarjeta.addEventListener("click", () => {
      addTarjetaField.value = "";
      modalAddTarjeta.classList.remove("hidden");
      addTarjetaField.focus();
    });
  }

  if (formAddTarjeta) {
    formAddTarjeta.addEventListener("submit", (e) => {
      e.preventDefault();
      const tarjeta = addTarjetaField.value.trim();
      if (!tarjeta) return;
      apiFetch("/compras/tarjetas", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `tarjeta=${encodeURIComponent(tarjeta)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          modalAddTarjeta.classList.add("hidden");
          const emptyState = tarjetasList.querySelector(".list-empty");
          if (emptyState) emptyState.remove();
          tarjetasList.insertAdjacentHTML("afterbegin", tarjetaCardHtml(data));
          wireTarjetaCardButtons();
          showToast("Tarjeta guardada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo agregar la tarjeta.");
        });
    });
  }

  if (formEditTarjeta) {
    formEditTarjeta.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = formEditTarjeta.dataset.id;
      const tarjeta = editTarjetaField.value.trim();
      if (!tarjeta) return;
      apiFetch(`/compras/tarjetas/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `tarjeta=${encodeURIComponent(tarjeta)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          modalEditTarjeta.classList.add("hidden");
          const card = tarjetasList.querySelector('.compra-tarjeta-card[data-id="' + id + '"]');
          if (card) card.outerHTML = tarjetaCardHtml(data);
          wireTarjetaCardButtons();
          showToast("Tarjeta actualizada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar la tarjeta.");
        });
    });
  }

  // ---------- Selección de correo + registro de compras ----------
  const comprasPanel = document.getElementById("compras-panel");
  const modalAddCompra = document.getElementById("modal-add-compra");
  const formAddCompra = document.getElementById("form-add-compra");
  const compraCorreoField = document.getElementById("compra-correo-field");
  const compraTarjetaField = document.getElementById("compra-tarjeta-field");
  const compraDescripcionField = document.getElementById("compra-descripcion-field");
  const compraMontoHint = document.getElementById("compra-monto-hint");
  const compraTagsChecklist = document.getElementById("compra-tags-checklist");
  const newCompraTagName = document.getElementById("new-compra-tag-name");
  const btnAddCompraTag = document.getElementById("btn-add-compra-tag");
  const compraTrackingsList = document.getElementById("compra-trackings-list");
  const btnAddTracking = document.getElementById("btn-add-tracking");
  const compraTrackingsCount = document.getElementById("compra-trackings-count");
  const modalTabBtns = document.querySelectorAll(".modal-tab-btn");
  const modalTabPanels = document.querySelectorAll(".modal-tab-panel");

  modalTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modalTabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      modalTabPanels.forEach((p) => p.classList.toggle("hidden", p.dataset.tabPanel !== btn.dataset.tab));
    });
  });

  function resetModalTabs() {
    modalTabBtns.forEach((b, i) => b.classList.toggle("active", i === 0));
    modalTabPanels.forEach((p, i) => p.classList.toggle("hidden", i !== 0));
  }

  function updateTrackingsCount() {
    const n = compraTrackingsList.querySelectorAll(".compra-tracking-row").length;
    compraTrackingsCount.textContent = n > 0 ? "(" + n + ")" : "";
  }

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

  function trackingChipHtml(t) {
    let text = escapeHtml(t.numero_tracking);
    if (t.articulo) text += " — " + escapeHtml(t.articulo);
    if (t.precio !== null && t.precio !== undefined && t.precio !== "") text += " $" + Number(t.precio).toFixed(2);
    return '<div class="compra-tracking-chip">📦 ' + text + "</div>";
  }

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
    const trackingLines =
      r.trackings && r.trackings.length
        ? '<div class="compra-trackings-lines">' + r.trackings.map(trackingChipHtml).join("") + "</div>"
        : "";
    const enviadoBadge =
      r.trackings && r.trackings.length
        ? '<div class="compra-enviado-badge">📦 Enviado</div>'
        : "";
    return (
      '<div class="compra-registro-card" data-id="' + r.id + '">' +
      '<button type="button" class="btn-remove-registro" data-id="' + r.id + '" title="Eliminar">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      enviadoBadge +
      '<div class="compra-registro-top"><b>Tarjeta:</b> ' +
      (r.tarjeta ? escapeHtml(r.tarjeta) : "—") +
      ' &nbsp; <b>Correo:</b> ' +
      escapeHtml(r.correo || "—") +
      "</div>" +
      (r.descripcion ? '<div class="compra-registro-descripcion">' + escapeHtml(r.descripcion) + "</div>" : "") +
      '<div class="compra-tiendas-lines">' +
      tiendaLines +
      "</div>" +
      trackingLines +
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

  // Filtro "Solo enviados" — se mantiene marcado al cambiar de correo.
  let onlyEnviados = false;

  function applyEnviadosFilter() {
    comprasPanel.querySelectorAll(".compra-registro-card").forEach((card) => {
      const data = registroDataById.get(Number(card.dataset.id));
      const isEnviado = !!(data && data.trackings && data.trackings.length);
      card.style.display = onlyEnviados && !isEnviado ? "none" : "";
    });
  }

  function renderRegistros(registros) {
    registroDataById = new Map();
    // El backend ya entrega los registros ordenados por creación más
    // reciente primero.
    const listHtml = registros.length
      ? '<div class="compra-registros-list">' + registros.map(registroCardHtml).join("") + "</div>"
      : '<div class="list-empty">Todavía no hay compras registradas para este correo.</div>';

    comprasPanel.innerHTML =
      '<div class="compras-panel-header"><h2>Registro de compras</h2>' +
      '<div class="compras-panel-header-actions">' +
      '<label class="compras-filter-enviados"><input type="checkbox" id="filter-enviados"' +
      (onlyEnviados ? " checked" : "") +
      ' /> Solo enviados</label>' +
      '<button type="button" id="btn-add-compra" class="btn-cta btn-icon-only" title="Agregar compra">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>' +
      "</div></div>" +
      listHtml;

    document.getElementById("btn-add-compra").addEventListener("click", () => openCompraModal(null));
    document.getElementById("filter-enviados").addEventListener("change", (e) => {
      onlyEnviados = e.target.checked;
      applyEnviadosFilter();
    });
    wireRegistroDeleteButtons();
    wireRegistroCardClicks();
    applyEnviadosFilter();
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

  function collectGroupMontos(group) {
    const v = group.querySelector(".compra-monto-input").value.trim();
    return v === "" ? [] : [v];
  }

  function updateMontoPlaceholder() {
    const hasGroups = compraMontoGroups.children.length > 0;
    if (compraMontoHint) compraMontoHint.style.display = hasGroups ? "none" : "";
  }

  // Una tienda = un solo monto. Si se compraron dos cosas de la misma
  // tienda, es otra tarjeta de compra aparte (no se acumulan aquí).
  function addMontoGroup(tagId, tagName, initialValue) {
    const div = document.createElement("div");
    div.className = "compra-monto-group";
    div.dataset.tagId = tagId;
    div.dataset.tagName = tagName;
    div.innerHTML =
      '<div class="compra-monto-group-header"><span>' +
      escapeHtml(tagName) +
      '</span></div>' +
      '<div class="row compra-monto-row">' +
      '<span class="muted" style="font-weight:700;">$</span>' +
      '<input type="number" class="compra-monto-input" step="0.01" min="0" placeholder="0.00" />' +
      "</div>";
    compraMontoGroups.appendChild(div);
    if (initialValue !== null && initialValue !== undefined && initialValue !== "") {
      div.querySelector(".compra-monto-input").value = initialValue;
    }
    updateMontoPlaceholder();
    return div;
  }

  // ---------- Trackings dentro de la compra (número, precio, artículo) ----------
  function trackingRowHtml() {
    return (
      '<div class="row compra-tracking-row">' +
      '<input type="text" class="compra-tracking-numero" placeholder="Número de tracking" />' +
      '<button type="button" class="icon-action danger-hover btn-remove-tracking" title="Quitar tracking">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      "</div>"
    );
  }

  function addTrackingRow(existing) {
    compraTrackingsList.insertAdjacentHTML("beforeend", trackingRowHtml());
    const row = compraTrackingsList.lastElementChild;
    if (existing) {
      row.querySelector(".compra-tracking-numero").value = existing.numero_tracking || "";
    }
    updateTrackingsCount();
    return row;
  }

  compraTrackingsList.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".btn-remove-tracking");
    if (removeBtn) {
      removeBtn.closest(".compra-tracking-row").remove();
      updateTrackingsCount();
    }
  });

  if (btnAddTracking) {
    btnAddTracking.addEventListener("click", () => addTrackingRow(null));
  }

  function collectTrackings() {
    return Array.from(compraTrackingsList.querySelectorAll(".compra-tracking-row"))
      .map((row) => ({
        numero_tracking: row.querySelector(".compra-tracking-numero").value.trim(),
      }))
      .filter((t) => t.numero_tracking !== "");
  }

  // existing === null → modo agregar. existing === {id, correo, tarjeta,
  // tiendas: [{tag_id, tag_name, montos}, ...]} → modo editar. Cada tarjeta
  // de compra es de UNA sola tienda (si compras dos cosas de la misma
  // tienda, son dos tarjetas separadas, no una con varias tiendas dentro).
  function openCompraModal(existing) {
    editingRegistroId = existing ? existing.id : null;
    modalTitle.textContent = existing ? "Editar compra" : "Agregar compra";
    btnSubmitCompra.textContent = existing ? "Guardar cambios" : "Guardar compra";
    compraCorreoField.value = existing ? existing.correo : "";
    compraTarjetaField.value = existing ? existing.tarjeta || "" : "";
    compraDescripcionField.value = existing ? existing.descripcion || "" : "";
    newCompraTagName.value = "";
    compraMontoGroups.innerHTML = "";
    compraTrackingsList.innerHTML = "";
    compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));
    resetModalTabs();

    if (existing) {
      // Compatibilidad con tarjetas viejas que sí tenían varias tiendas:
      // al editar solo se conserva la primera (ahora es 1 a 1).
      const t = existing.tiendas[0];
      if (t) {
        const card = compraTagsChecklist.querySelector('.tag-card[data-tag-id="' + t.tag_id + '"]');
        if (card) {
          card.classList.add("selected");
          const firstValue = (t.montos || "").split(",")[0].trim();
          addMontoGroup(t.tag_id, card.querySelector(".tag-card-name").textContent.trim(), firstValue);
        }
      }
      (existing.trackings || []).forEach((t) => addTrackingRow(t));
    }
    updateTrackingsCount();
    updateMontoPlaceholder();
    modalAddCompra.classList.remove("hidden");
  }

  // La tienda es selección única — al elegir una se reemplaza la anterior.
  // Dar clic en la ya elegida la deselecciona.
  compraTagsChecklist.addEventListener("click", (e) => {
    const card = e.target.closest(".tag-card");
    if (!card) return;
    const tagId = card.dataset.tagId;
    const alreadySelected = card.classList.contains("selected");
    compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));
    compraMontoGroups.innerHTML = "";
    if (!alreadySelected) {
      const tagName = card.querySelector(".tag-card-name").textContent.trim();
      card.classList.add("selected");
      addMontoGroup(tagId, tagName, null);
    }
    updateMontoPlaceholder();
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
          compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));
          compraMontoGroups.innerHTML = "";
          const newCard = compraTagsChecklist.lastElementChild;
          newCard.classList.add("selected");
          addMontoGroup(data.id, data.name, null);
          newCompraTagName.value = "";
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo crear la etiqueta.");
        });
    });
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
      const descripcion = compraDescripcionField.value.trim();
      const groups = Array.from(compraMontoGroups.querySelectorAll(".compra-monto-group"));
      if (!groups.length) {
        showToast("Elige la tienda.");
        return;
      }

      // Cada tarjeta es de una sola tienda.
      const tiendas = groups.map((group) => ({
        tag_id: group.dataset.tagId,
        montos: collectGroupMontos(group).join(","),
      }));
      const trackings = collectTrackings();
      const payload = { compra_email_id: selectedEmailId, correo, tarjeta, descripcion, tiendas, trackings };
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
          applyEnviadosFilter();
          showToast(editingRegistroId ? "Compra actualizada" : "Compra agregada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar la compra.");
        });
    });
  }
});
