const short = (v) =>
  v ? `${v.slice(0, 6)}...${v.slice(-6)}` : "Not connected";
async function connectWallet() {
  const p = window.solana;
  if (!p?.connect) {
    alert("Install Phantom or another Solana wallet.");
    return;
  }
  const r = await p.connect();
  const k = r.publicKey?.toString() || p.publicKey?.toString();
  document.querySelectorAll("[data-wallet-address]").forEach((n) => {
    n.textContent = short(k);
    n.title = k;
  });
  document.querySelectorAll("[data-wallet-full]").forEach((n) => {
    n.textContent = k || "Not connected";
  });
  document.querySelectorAll("[data-wallet-state]").forEach((n) => {
    n.textContent = "Wallet connected";
    n.classList.add("verified");
  });
}
async function hydrateDeployment() {
  try {
    const r = await fetch("/app/deployment.json", { cache: "no-store" });
    if (!r.ok) throw new Error("missing");
    const d = await r.json();
    document.querySelectorAll("[data-deployment-status]").forEach((n) => {
      n.textContent = `Deployed on ${d.cluster || "devnet"}`;
      n.classList.add("verified");
    });
    document.querySelectorAll("[data-program-id]").forEach((n) => {
      n.textContent = d.programId || "No program id";
    });
  } catch {
    document.querySelectorAll("[data-deployment-status]").forEach((n) => {
      n.textContent = "Contract not deployed yet";
      n.classList.add("warning");
    });
    document.querySelectorAll("[data-program-id]").forEach((n) => {
      n.textContent = "No verified deployment metadata";
    });
  }
}
document
  .querySelectorAll("[data-wallet-connect]")
  .forEach((b) => b.addEventListener("click", connectWallet));
hydrateDeployment();
