const form = document.querySelector("#positionForm");
const market = document.querySelector("#market");
const entryPrice = document.querySelector("#entryPrice");
const markPrice = document.querySelector("#markPrice");
const collateral = document.querySelector("#collateral");
const leverage = document.querySelector("#leverage");
const maintenance = document.querySelector("#maintenance");
const fee = document.querySelector("#fee");

const output = {
  notional: document.querySelector("#notional"),
  positionSize: document.querySelector("#positionSize"),
  pnl: document.querySelector("#pnl"),
  equity: document.querySelector("#equity"),
  liquidation: document.querySelector("#liquidation"),
  riskBand: document.querySelector("#riskBand"),
  riskFill: document.querySelector("#riskFill"),
  riskLabel: document.querySelector("#riskLabel"),
  deploymentStatus: document.querySelector("#deploymentStatus"),
  programId: document.querySelector("#programId"),
  network: document.querySelector("#network"),
  cluster: document.querySelector("#cluster"),
  metadataSource: document.querySelector("#metadataSource"),
  networkPill: document.querySelector("#networkPill"),
};

const deploymentCandidates = [
  "/deployment.json",
  "/deployments/arcium_private_perps.json",
  "/app/deployment.json",
  "/Anchor.toml",
  "/Arcium.toml",
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function numberFrom(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function currentSide() {
  return new FormData(form).get("side") === "short" ? "short" : "long";
}

function calculatePosition() {
  const entry = Math.max(numberFrom(entryPrice), 0.01);
  const mark = Math.max(numberFrom(markPrice), 0.01);
  const margin = Math.max(numberFrom(collateral), 0);
  const lev = Math.max(numberFrom(leverage, 1), 1);
  const maintenanceRate = Math.max(numberFrom(maintenance), 0) / 100;
  const feeRate = Math.max(numberFrom(fee), 0) / 100;
  const side = currentSide();
  const symbol = market.value.split("-")[0];

  const notional = margin * lev;
  const size = notional / entry;
  const direction = side === "long" ? 1 : -1;
  const pnl = (mark - entry) * size * direction;
  const openingFee = notional * feeRate;
  const equity = margin + pnl - openingFee;
  const maintenanceMargin = notional * maintenanceRate;
  const distance = (margin - maintenanceMargin - openingFee) / size;
  const liquidation = side === "long" ? entry - distance : entry + distance;
  const marginUsage =
    maintenanceMargin <= 0 ? 0 : maintenanceMargin / Math.max(equity, 1);
  const risk = Math.min(Math.max(marginUsage * 100, 0), 100);

  output.notional.textContent = currency.format(notional);
  output.positionSize.textContent = `${decimal.format(size)} ${symbol}`;
  output.pnl.textContent = currency.format(pnl);
  output.pnl.style.color = pnl >= 0 ? "var(--accent)" : "var(--danger)";
  output.equity.textContent = currency.format(equity);
  output.liquidation.textContent = currency.format(Math.max(liquidation, 0));
  output.riskFill.style.width = `${risk}%`;

  output.riskBand.classList.remove("warning", "danger");
  if (equity <= maintenanceMargin) {
    output.riskBand.classList.add("danger");
    output.riskLabel.textContent = "Liquidation risk";
  } else if (risk > 60) {
    output.riskBand.classList.add("warning");
    output.riskLabel.textContent = "Margin watch";
  } else {
    output.riskLabel.textContent = "Healthy";
  }
}

function syncMarketPrice() {
  const selected = market.selectedOptions[0];
  const price = selected?.dataset.price;
  if (price) {
    entryPrice.value = Number(price).toFixed(2);
    markPrice.value = Number(price).toFixed(2);
  }
  calculatePosition();
}

function parseJsonMetadata(text) {
  const data = JSON.parse(text);
  const programId =
    data.programId ||
    data.program_id ||
    data.address ||
    data.program ||
    data?.program?.id ||
    "";
  const network =
    data.network ||
    data.cluster ||
    data.solanaCluster ||
    data?.deployment?.network ||
    "";
  const cluster =
    data.cluster || data.rpcCluster || data?.deployment?.cluster || network;

  if (!programId && !network && !cluster) return null;

  return {
    programId,
    network,
    cluster,
  };
}

function parseTomlMetadata(text) {
  const lines = text.split(/\r?\n/);
  const pairs = {};
  let section = "";

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    const match = line.match(
      /^\s*([A-Za-z0-9_.-]+)\s*=\s*["']?([^"'\n#]+)["']?\s*(?:#.*)?$/
    );
    if (match) {
      pairs[match[1]] = match[2].trim();
      if (section) pairs[`${section}.${match[1]}`] = match[2].trim();
    }
  }

  const programId =
    pairs["programs.localnet.arcium_private_perps"] ||
    pairs["programs.devnet.arcium_private_perps"] ||
    pairs["programs.mainnet.arcium_private_perps"] ||
    pairs.arcium_private_perps ||
    pairs.program_id ||
    pairs.programId ||
    "";
  const cluster = pairs["provider.cluster"] || pairs.cluster || "";

  if (!programId && !cluster) return null;

  return {
    programId,
    network: cluster,
    cluster,
  };
}

async function readCandidate(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return null;

  const text = await response.text();
  const trimmed = text.trim();
  if (
    !trimmed ||
    trimmed.startsWith("<!doctype html") ||
    trimmed.startsWith("<html")
  )
    return null;

  try {
    return {
      source: path,
      metadata: path.endsWith(".json")
        ? parseJsonMetadata(trimmed)
        : parseTomlMetadata(trimmed),
    };
  } catch {
    return null;
  }
}

function showUndeployed() {
  output.deploymentStatus.textContent = "not deployed yet";
  output.deploymentStatus.className = "status-badge empty";
  output.programId.textContent = "not deployed yet";
  output.network.textContent = "not deployed yet";
  output.cluster.textContent = "not deployed yet";
  output.metadataSource.textContent = "not deployed yet";
  output.networkPill.textContent = "Not deployed yet";
}

function showDeployment(source, metadata) {
  const programId = metadata.programId || "not deployed yet";
  const network = metadata.network || "not deployed yet";
  const cluster = metadata.cluster || network;

  output.deploymentStatus.textContent =
    programId === "not deployed yet" ? "not deployed yet" : "metadata verified";
  output.deploymentStatus.className =
    programId === "not deployed yet"
      ? "status-badge empty"
      : "status-badge deployed";
  output.programId.textContent = programId;
  output.network.textContent = network;
  output.cluster.textContent = cluster || "not deployed yet";
  output.metadataSource.textContent = source;
  output.networkPill.textContent =
    programId === "not deployed yet"
      ? "Not deployed yet"
      : `Verified on ${network || cluster}`;
}

async function loadDeploymentMetadata() {
  for (const path of deploymentCandidates) {
    const result = await readCandidate(path);
    if (result?.metadata) {
      showDeployment(result.source, result.metadata);
      return;
    }
  }
  showUndeployed();
}

form.addEventListener("input", calculatePosition);
form.addEventListener("change", calculatePosition);
market.addEventListener("change", syncMarketPrice);

calculatePosition();
loadDeploymentMetadata();
