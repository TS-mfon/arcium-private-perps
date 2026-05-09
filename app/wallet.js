const CLUSTER = "devnet";
const RPC_URL = "https://api.devnet.solana.com";
const state = {
  walletName: "",
  publicKey: "",
  deployment: null,
};

const short = (value) =>
  value ? `${value.slice(0, 4)}...${value.slice(-4)}` : "Not connected";

const wallets = [
  {
    name: "Phantom",
    install: "https://phantom.app/",
    get provider() {
      return window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
    },
  },
  {
    name: "Solflare",
    install: "https://solflare.com/",
    get provider() {
      return window.solflare || (window.solana?.isSolflare ? window.solana : null);
    },
  },
  {
    name: "Backpack",
    install: "https://backpack.app/",
    get provider() {
      return window.backpack?.solana || (window.solana?.isBackpack ? window.solana : null);
    },
  },
  {
    name: "Detected wallet",
    install: "https://solana.com/ecosystem/explore?categories=wallet",
    get provider() {
      return window.solana || null;
    },
  },
];

boot();

function boot() {
  injectWalletModal();
  bindWalletButtons();
  bindProofPanels();
  bindDemoForms();
  hydrateDeployment();
  renderWallet();
}

function injectWalletModal() {
  if (document.querySelector("#wallet-modal")) return;
  const modal = document.createElement("div");
  modal.id = "wallet-modal";
  modal.className = "wallet-modal";
  modal.innerHTML = `
    <section class="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
      <div class="status-row">
        <div>
          <p class="eyebrow">Solana wallet</p>
          <h2 id="wallet-title">Choose a wallet</h2>
        </div>
        <button class="ghost" type="button" data-wallet-close>Close</button>
      </div>
      <p class="muted">Connect with an installed Solana wallet. The app never asks for seed phrases or private keys.</p>
      <div data-wallet-options></div>
    </section>`;
  document.body.append(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-wallet-close]")) {
      modal.classList.remove("open");
    }
  });
}

function bindWalletButtons() {
  document.querySelectorAll("[data-wallet-connect]").forEach((button) => {
    button.addEventListener("click", openWalletModal);
  });
}

function openWalletModal() {
  const modal = document.querySelector("#wallet-modal");
  const options = modal.querySelector("[data-wallet-options]");
  options.replaceChildren();
  for (const wallet of wallets) {
    const installed = Boolean(wallet.provider);
    const option = document.createElement("button");
    option.type = "button";
    option.className = "wallet-option";
    option.innerHTML = `<strong>${wallet.name}</strong><small>${installed ? "Installed" : "Install"}</small>`;
    option.addEventListener("click", () =>
      installed ? connectWallet(wallet) : window.open(wallet.install, "_blank", "noreferrer")
    );
    options.append(option);
  }
  modal.classList.add("open");
}

async function connectWallet(wallet) {
  try {
    const provider = wallet.provider;
    const response = await provider.connect();
    state.walletName = wallet.name;
    state.publicKey = response.publicKey?.toString() || provider.publicKey?.toString() || "";
    document.querySelector("#wallet-modal")?.classList.remove("open");
    renderWallet();
  } catch (error) {
    pushActivity("Wallet connection rejected", "Connect request was cancelled or failed.");
  }
}

function renderWallet() {
  document.querySelectorAll("[data-wallet-connect]").forEach((button) => {
    button.textContent = state.publicKey ? `${state.walletName}: ${short(state.publicKey)}` : "Connect wallet";
  });
  document.querySelectorAll("[data-wallet-full]").forEach((node) => {
    node.textContent = state.publicKey || "Connect a wallet to continue";
  });
  document.querySelectorAll("[data-wallet-state]").forEach((node) => {
    node.textContent = state.publicKey ? "Wallet connected" : "Wallet required";
    node.className = `status-pill ${state.publicKey ? "good" : "warn"}`;
  });
}

async function hydrateDeployment() {
  try {
    const response = await fetch("/app/deployment.json", { cache: "no-store" });
    if (response.ok) state.deployment = await response.json();
  } catch {
    state.deployment = null;
  }

  const hasDeployment = Boolean(state.deployment?.programId);
  document.querySelectorAll("[data-contract-state]").forEach((node) => {
    node.textContent = hasDeployment ? "Devnet contract configured" : "Contract deployment required";
    node.className = `status-pill ${hasDeployment ? "good" : "warn"}`;
  });
  document.querySelectorAll("[data-program-id]").forEach((node) => {
    node.textContent = state.deployment?.programId || "Not configured";
  });
  document.querySelectorAll("[data-deploy-tx]").forEach((node) => {
    const sig = state.deployment?.programDeploySignature || "";
    node.innerHTML = sig
      ? `<a href="${explorerTx(sig)}" target="_blank" rel="noreferrer">${short(sig)}</a>`
      : "Not available";
  });
  document.querySelectorAll("[data-submit-action]").forEach((button) => {
    button.disabled = !hasDeployment;
    if (!hasDeployment) button.textContent = "Deploy contract first";
  });
}

function bindProofPanels() {
  document.querySelectorAll("[data-proof-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".proof-panel")?.classList.toggle("open");
    });
  });
}

function bindDemoForms() {
  document.querySelectorAll("[data-action-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!state.publicKey) {
        openWalletModal();
        return;
      }
      if (!state.deployment?.programId) {
        pushActivity("Deployment missing", "This function needs a deployed Arcium program before it can submit.");
        return;
      }
      const action = form.getAttribute("data-action-form") || "Action";
      pushActivity(`${action} prepared`, "Wallet is connected. Transaction wiring is ready for the deployed instruction client.");
    });
  });
}

function pushActivity(title, detail) {
  const feed = document.querySelector("[data-activity]");
  if (!feed) return;
  const item = document.createElement("article");
  item.className = "activity-item";
  item.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p>`;
  feed.prepend(item);
}

function explorerTx(signature) {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
