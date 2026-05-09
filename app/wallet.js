const RPC_URL = "https://api.devnet.solana.com";
const CLUSTER = "devnet";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const state = {
  walletName: "",
  publicKey: "",
  provider: null,
  config: null,
  web3: null,
};

const short = (value) =>
  value ? `${value.slice(0, 4)}...${value.slice(-4)}` : "Not connected";
const wallets = [
  {
    name: "Phantom",
    url: "https://phantom.app/",
    provider: () =>
      window.phantom?.solana ||
      (window.solana?.isPhantom ? window.solana : null),
  },
  {
    name: "Solflare",
    url: "https://solflare.com/",
    provider: () =>
      window.solflare || (window.solana?.isSolflare ? window.solana : null),
  },
  {
    name: "Backpack",
    url: "https://backpack.app/",
    provider: () =>
      window.backpack?.solana ||
      (window.solana?.isBackpack ? window.solana : null),
  },
  {
    name: "Detected wallet",
    url: "https://solana.com/ecosystem/explore?categories=wallet",
    provider: () => window.solana || null,
  },
];

boot();

async function boot() {
  state.config = await loadConfig();
  injectWalletModal();
  ensureWorkspace();
  bindWalletButtons();
  bindForms();
  renderWallet();
  renderLocalWorkspace();
}

async function getWeb3() {
  if (!state.web3)
    state.web3 = await import("https://esm.sh/@solana/web3.js@1.95.8?bundle");
  return state.web3;
}

async function loadConfig() {
  try {
    const response = await fetch("/config/program.json", {
      cache: "no-store",
    });
    if (response.ok) return await response.json();
  } catch {}
  return null;
}

function injectWalletModal() {
  if (document.querySelector("#wallet-modal")) return;
  const modal = document.createElement("div");
  modal.id = "wallet-modal";
  modal.className = "wallet-modal";
  modal.innerHTML = `
    <section class="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
      <div class="status-row">
        <div><p class="eyebrow">Solana wallet</p><h2 id="wallet-title">Choose a wallet</h2></div>
        <button class="ghost" type="button" data-wallet-close>Close</button>
      </div>
      <p class="muted">Connect with an installed Solana wallet. This app never asks for seed phrases or private keys.</p>
      <div data-wallet-options></div>
    </section>`;
  document.body.append(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-wallet-close]"))
      modal.classList.remove("open");
  });
}

function bindWalletButtons() {
  document
    .querySelectorAll("[data-wallet-connect]")
    .forEach((button) => button.addEventListener("click", openWalletModal));
}

function openWalletModal() {
  const modal = document.querySelector("#wallet-modal");
  const options = modal.querySelector("[data-wallet-options]");
  options.replaceChildren();
  for (const wallet of wallets) {
    const provider = wallet.provider();
    const option = document.createElement("button");
    option.type = "button";
    option.className = "wallet-option";
    option.innerHTML = `<strong>${wallet.name}</strong><small>${
      provider ? "Installed" : "Install"
    }</small>`;
    option.addEventListener("click", () =>
      provider
        ? connectWallet(wallet.name, provider)
        : window.open(wallet.url, "_blank", "noreferrer")
    );
    options.append(option);
  }
  modal.classList.add("open");
}

async function connectWallet(name, provider) {
  const response = await provider.connect();
  state.walletName = name;
  state.provider = provider;
  state.publicKey =
    response.publicKey?.toString() || provider.publicKey?.toString() || "";
  document.querySelector("#wallet-modal")?.classList.remove("open");
  renderWallet();
  renderLocalWorkspace();
}

function renderWallet() {
  document.querySelectorAll("[data-wallet-connect]").forEach((button) => {
    button.textContent = state.publicKey
      ? `${state.walletName}: ${short(state.publicKey)}`
      : "Connect wallet";
  });
  document.querySelectorAll("[data-wallet-full]").forEach((node) => {
    node.textContent = state.publicKey || "Connect a wallet to continue";
  });
  document.querySelectorAll("[data-wallet-state]").forEach((node) => {
    node.textContent = state.publicKey ? "Wallet connected" : "Wallet required";
    node.className = `status-pill ${state.publicKey ? "good" : "warn"}`;
  });
}

function bindForms() {
  document.querySelectorAll("[data-action-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitAction(form);
    });
  });
}

async function submitAction(form) {
  if (!state.provider || !state.publicKey) {
    openWalletModal();
    return;
  }
  const submit = form.querySelector("[data-submit-action]");
  const originalText = submit?.textContent || "Submit";
  try {
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Sending transaction...";
    }
    const signature = await sendRecordAction(form);
    pushActivity(
      "Transaction confirmed",
      `Explorer: ${explorerTx(signature)}`,
      signature
    );
    await saveLocalRecord(form, signature);
    renderLocalWorkspace();
  } catch (error) {
    pushActivity(
      "Transaction failed",
      error?.message || "The wallet or RPC rejected the transaction."
    );
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  }
}

async function sendRecordAction(form) {
  const web3 = await getWeb3();
  const programId = new web3.PublicKey(
    state.config?.programId || state.config?.program_id
  );
  const actor = new web3.PublicKey(state.publicKey);
  const connection = new web3.Connection(
    state.config?.rpcUrl || RPC_URL,
    "confirmed"
  );
  const actionId =
    BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  const [receipt] = web3.PublicKey.findProgramAddressSync(
    [utf8("action"), actor.toBuffer(), u64(actionId)],
    programId
  );
  const payloadHash = await hashPayload(form);
  const data = concatBytes(
    await discriminator("record_action"),
    u64(actionId),
    new Uint8Array([actionType(form)]),
    payloadHash
  );
  const ix = new web3.TransactionInstruction({
    programId,
    keys: [
      { pubkey: actor, isSigner: true, isWritable: true },
      { pubkey: receipt, isSigner: false, isWritable: true },
      {
        pubkey: new web3.PublicKey(SYSTEM_PROGRAM_ID),
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
  const tx = new web3.Transaction().add(ix);
  tx.feePayer = actor;
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;
  if (state.provider.signAndSendTransaction) {
    const result = await state.provider.signAndSendTransaction(tx);
    const signature = typeof result === "string" ? result : result.signature;
    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  }
  const signed = await state.provider.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

async function hashPayload(form) {
  const values = [...form.querySelectorAll("input, select, textarea")]
    .map(
      (node) =>
        `${node.closest("label")?.textContent?.trim() || node.name}:${
          node.value
        }`
    )
    .join("|");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(values)));
}

async function discriminator(name) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8(`global:${name}`))
  ).slice(0, 8);
}

function actionType(form) {
  const action = (form.getAttribute("data-action-form") || "").toLowerCase();
  if (
    action.includes("create") ||
    action.includes("register") ||
    action.includes("supply")
  )
    return 1;
  if (
    action.includes("bid") ||
    action.includes("borrow") ||
    action.includes("open")
  )
    return 2;
  if (
    action.includes("close") ||
    action.includes("settle") ||
    action.includes("repay")
  )
    return 3;
  if (
    action.includes("risk") ||
    action.includes("health") ||
    action.includes("discover")
  )
    return 4;
  if (action.includes("liquidate") || action.includes("match")) return 5;
  return 9;
}

function pushActivity(title, detail, signature = "") {
  const feed =
    document.querySelector("[data-activity]") || ensureActivityFeed();
  const item = document.createElement("article");
  item.className = "activity-item";
  item.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${
    signature
      ? `<a href="${explorerTx(
          signature
        )}" target="_blank" rel="noreferrer">${escapeHtml(
          short(signature)
        )}</a>`
      : escapeHtml(detail)
  }</p>`;
  feed.prepend(item);
}

function ensureWorkspace() {
  if (document.querySelector("[data-local-workspace]")) return;
  const layout = document.querySelector(".layout");
  if (!layout) return;
  const panel = document.createElement("aside");
  panel.className = "panel local-workspace";
  panel.setAttribute("data-local-workspace", "true");
  panel.innerHTML = `
    <p class="eyebrow">Private workspace</p>
    <h2>Your signed actions</h2>
    <p class="muted">These entries are kept in this browser so the UI can show your own private drafts next to explorer-confirmed transactions. Raw private inputs are not read back from Solana.</p>
    <div class="local-insight" data-local-insight></div>
    <div class="activity" data-local-records></div>`;
  layout.append(panel);
}

async function saveLocalRecord(form, signature) {
  const fields = collectFields(form);
  const record = {
    id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    action: form.getAttribute("data-action-form") || "Action",
    createdAt: new Date().toISOString(),
    wallet: state.publicKey,
    signature,
    explorer: explorerTx(signature),
    fields,
    payloadHash: await hex(await hashPayload(form)),
  };
  const contact = await enrichContactRecord(record);
  const records = readRecords();
  records.unshift(contact || record);
  writeRecords(records.slice(0, 80));
}

function collectFields(form) {
  return [...form.querySelectorAll("input, select, textarea")]
    .map((node) => ({
      label: cleanLabel(
        node.closest("label")?.textContent || node.name || "Input"
      ),
      value: node.value.trim(),
      kind: node.tagName.toLowerCase(),
    }))
    .filter((field) => field.value);
}

async function enrichContactRecord(record) {
  const action = record.action.toLowerCase();
  if (!isContactApp()) return null;
  if (action.includes("register")) {
    const identifier = record.fields[0]?.value || "";
    const normalized = normalizeContact(identifier);
    return {
      ...record,
      privateType: "registered-identifier",
      localIdentifier: identifier,
      normalizedIdentifier: normalized,
      identifierHash: await hashText(normalized),
    };
  }
  if (action.includes("discover")) {
    const contacts = splitContacts(record.fields[0]?.value || "");
    const registered = readRecords().filter((item) => item.identifierHash);
    const contactHashes = await Promise.all(
      contacts.map(async (contact) => ({
        contact,
        normalized: normalizeContact(contact),
        hash: await hashText(normalizeContact(contact)),
      }))
    );
    const registeredHashes = new Set(
      registered.map((item) => item.identifierHash)
    );
    return {
      ...record,
      privateType: "discovery-request",
      contactsChecked: contacts.length,
      matches: contactHashes
        .filter((item) => registeredHashes.has(item.hash))
        .map((item) => item.contact),
    };
  }
  return null;
}

function renderLocalWorkspace() {
  const list = document.querySelector("[data-local-records]");
  const insight = document.querySelector("[data-local-insight]");
  if (!list || !insight) return;
  const records = readRecords();
  insight.innerHTML = renderInsight(records);
  list.replaceChildren();
  if (!records.length) {
    list.innerHTML = `<article class="activity-item"><strong>No local actions yet</strong><p>Connect a wallet, submit a form, and the signed receipt will appear here.</p></article>`;
    return;
  }
  for (const record of records.slice(0, 8)) {
    const item = document.createElement("article");
    item.className = "activity-item";
    item.innerHTML = renderRecord(record);
    list.append(item);
  }
}

function renderInsight(records) {
  if (isContactApp()) {
    const registered = records.filter(
      (item) => item.privateType === "registered-identifier"
    );
    const discoveries = records.filter(
      (item) => item.privateType === "discovery-request"
    );
    const matches = discoveries.flatMap((item) => item.matches || []);
    return `<div class="mini-grid"><div><strong>${
      registered.length
    }</strong><span>Local commitments</span></div><div><strong>${
      matches.length
    }</strong><span>Local matches</span></div></div>${
      matches.length
        ? `<p class="match-list">${matches.map(escapeHtml).join(", ")}</p>`
        : `<p class="muted">Matches appear only when a discovery request contains a locally registered identifier.</p>`
    }`;
  }
  const app = appName();
  const count = records.length;
  const last = records[0]?.action || "No action";
  return `<div class="mini-grid"><div><strong>${count}</strong><span>Signed receipts</span></div><div><strong>${escapeHtml(
    last
  )}</strong><span>Latest local action</span></div></div><p class="muted">${escapeHtml(
    app
  )} keeps private inputs local and links each action to a confirmed Solana transaction.</p>`;
}

function renderRecord(record) {
  const fields = record.fields
    .slice(0, 4)
    .map(
      (field) =>
        `<li><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(
          field.value
        )}</strong></li>`
    )
    .join("");
  const matches = record.matches?.length
    ? `<p class="match-list">Matched locally: ${record.matches
        .map(escapeHtml)
        .join(", ")}</p>`
    : "";
  return `<strong>${escapeHtml(record.action)}</strong><p><a href="${
    record.explorer
  }" target="_blank" rel="noreferrer">${escapeHtml(
    short(record.signature)
  )}</a> · ${new Date(
    record.createdAt
  ).toLocaleString()}</p>${matches}<ul class="record-fields">${fields}</ul><p class="muted">Payload hash: ${escapeHtml(
    record.payloadHash.slice(0, 16)
  )}...</p>`;
}

function readRecords() {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) || "[]");
  } catch {
    return [];
  }
}

function writeRecords(records) {
  localStorage.setItem(storageKey(), JSON.stringify(records));
}

function storageKey() {
  const program = state.config?.programId || location.host;
  const wallet = state.publicKey || "disconnected";
  return `arcium-dapp:${program}:${wallet}`;
}

function isContactApp() {
  return (
    (state.config?.programId || "").startsWith("2cWb") ||
    document.title.toLowerCase().includes("contact")
  );
}

function appName() {
  return (
    document.querySelector(".brand span:last-child")?.textContent ||
    document.title ||
    "This dapp"
  );
}

function splitContacts(value) {
  return value
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeContact(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "");
}

async function hashText(value) {
  return hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(value)))
  );
}

async function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanLabel(value) {
  return String(value)
    .replace(/Connect a wallet to continue/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureActivityFeed() {
  let feed = document.querySelector("[data-generated-activity]");
  if (feed) return feed;
  feed = document.createElement("div");
  feed.className = "activity activity-toast-stack";
  feed.setAttribute("data-generated-activity", "true");
  document.body.append(feed);
  return feed;
}

function explorerTx(signature) {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

function utf8(value) {
  return new TextEncoder().encode(String(value));
}

function u64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}

function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        char
      ])
  );
}
