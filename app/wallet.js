const RPC_URL = "https://api.devnet.solana.com";
const CLUSTER = "devnet";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const PROGRAMS = {
  blind: "7yCwxegCFzv1JU47HQ6FKfMQqXBhVS3udi6GVjGN6Sq7",
  perps: "2HfWctJbtQTKFYnyLMHsmY5sGa3uAB6g4MVHSVWxCZ8G",
  lending: "7W6PS52sHgz74525XbmnP7J3neRQa7HEagixu3b2ZqnV",
  contact: "2cWbFVSzasSV2JgBmZNdK7NK3Le9WwNGQerMgbz5eHfq",
};

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
  if (!state.web3) {
    state.web3 = await import("https://esm.sh/@solana/web3.js@1.95.8?bundle");
  }
  return state.web3;
}

async function loadConfig() {
  try {
    const response = await fetch("/config/program.json", { cache: "no-store" });
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
    if (event.target === modal || event.target.closest("[data-wallet-close]")) {
      modal.classList.remove("open");
    }
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
  const submit = form.querySelector("[data-submit-action]");
  const originalText = submit?.textContent || "Submit";
  try {
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Working...";
    }
    const action = (form.getAttribute("data-action-form") || "").toLowerCase();
    if (isReadOnlyAction(action)) {
      const snapshot = await runReadOnlyAction(form);
      pushActivity(
        "Result loaded",
        snapshot.summary || "Loaded latest result."
      );
      await saveLocalRecord(form, "", snapshot);
      renderLocalWorkspace();
      return;
    }
    if (!state.provider || !state.publicKey) {
      openWalletModal();
      return;
    }
    const result = await executeOnchainAction(form);
    pushActivity(
      "Transaction confirmed",
      `Explorer: ${explorerTx(result.signature)}`,
      result.signature
    );
    await saveLocalRecord(form, result.signature, result.snapshot);
    renderLocalWorkspace();
  } catch (error) {
    pushActivity(
      "Action failed",
      error?.message || "The wallet or RPC rejected the action."
    );
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  }
}

function isReadOnlyAction(action) {
  return currentApp() === "contact" && action.includes("view matches");
}

async function executeOnchainAction(form) {
  const web3 = await getWeb3();
  const actor = new web3.PublicKey(state.publicKey);
  const programId = new web3.PublicKey(
    state.config?.programId || currentProgramId()
  );
  const connection = new web3.Connection(
    state.config?.rpcUrl || RPC_URL,
    "confirmed"
  );
  const ctx = { web3, actor, programId, connection };
  const handler = await buildHandler(form, ctx);
  const signature = await sendInstruction(handler.instruction, ctx);
  const snapshot = handler.afterConfirm
    ? await handler.afterConfirm(signature)
    : null;
  return { signature, snapshot };
}

async function buildHandler(form, ctx) {
  const app = currentApp();
  const action = (form.getAttribute("data-action-form") || "").toLowerCase();

  if (app === "blind" && action.includes("create")) {
    return buildCreateAuction(form, ctx);
  }
  if (app === "blind" && action.includes("bid")) {
    return buildSubmitBid(form, ctx);
  }
  if (app === "blind" && action.includes("close")) {
    return buildRecordAction(form, ctx, 3, "Auction close request");
  }
  if (app === "perps" && action.includes("open")) {
    return buildOpenPosition(form, ctx);
  }
  if (app === "perps" && action.includes("risk")) {
    return buildRecordAction(form, ctx, 4, "Risk check receipt");
  }
  if (app === "perps" && action.includes("settle")) {
    return buildRecordAction(form, ctx, 3, "Settlement receipt");
  }
  if (app === "lending" && action.includes("borrow")) {
    const selected = fieldValue(form, "action").toLowerCase();
    if (selected.includes("borrow")) return buildBorrow(form, ctx);
    return buildRecordAction(form, ctx, 1, "Supply receipt");
  }
  if (app === "lending" && action.includes("repay")) {
    return buildRecordAction(form, ctx, 3, "Repay or withdraw receipt");
  }
  if (app === "lending" && action.includes("withdraw")) {
    return buildRecordAction(form, ctx, 3, "Repay or withdraw receipt");
  }
  if (app === "lending" && action.includes("liquidate")) {
    return buildRecordAction(form, ctx, 5, "Liquidation request");
  }
  if (app === "contact" && action.includes("register")) {
    return buildRegisterIdentifier(form, ctx);
  }
  if (app === "contact" && action.includes("discover")) {
    return buildDiscoveryRequest(form, ctx);
  }

  return buildRecordAction(form, ctx, 9, "Action receipt");
}

async function runReadOnlyAction(form) {
  const app = currentApp();
  if (app === "contact") return loadContactMatches(form);
  throw new Error("This page has no read-only action configured.");
}

async function buildCreateAuction(form, ctx) {
  const auctionId = autoIdFromField(form, "auction id");
  const title = fieldValue(form, "auction title") || "Encrypted Auction";
  const asset = fieldValue(form, "asset mint") || "Unknown asset";
  const mode = modeIndex(fieldValue(form, "mode"));
  const reserve = parseUnits(fieldValue(form, "reserve floor"), 6);
  const supply = parseInteger(fieldValue(form, "supply"), 1);
  const endTs = BigInt(Math.floor(Date.now() / 1000) + 86400);
  const [auctionPda] = ctx.web3.PublicKey.findProgramAddressSync(
    [utf8("auction"), ctx.actor.toBuffer(), u64(auctionId)],
    ctx.programId
  );
  return {
    instruction: new ctx.web3.TransactionInstruction({
      programId: ctx.programId,
      keys: [
        { pubkey: ctx.actor, isSigner: true, isWritable: true },
        { pubkey: auctionPda, isSigner: false, isWritable: true },
        {
          pubkey: new ctx.web3.PublicKey(SYSTEM_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: concatBytes(
        await discriminator("create_auction"),
        u64(auctionId),
        stringBytes(title),
        stringBytes(asset),
        u8(mode),
        u64(reserve),
        u64(supply),
        i64(endTs)
      ),
    }),
    afterConfirm: async () => {
      const account = await fetchDecodedAccount(ctx, auctionPda, "Auction");
      return {
        onchainAddress: auctionPda.toBase58(),
        onchainType: "Auction",
        summary: `Auction ${title} created.`,
        onchainData: account,
        generatedId: auctionId.toString(),
      };
    },
  };
}

async function buildSubmitBid(form, ctx) {
  const auctionKey = requiredPublicKey(
    fieldValue(form, "auction account"),
    ctx.web3
  );
  const bidId = autoId();
  const amount = fieldValue(form, "bid amount");
  const quantity = parseInteger(fieldValue(form, "quantity"), 1);
  const localNonce = fieldValue(form, "private nonce") || randomToken();
  const payload = JSON.stringify({ amount, quantity, localNonce });
  const encryptedBidHash = await sha256Bytes(utf8(payload));
  const [bidPda] = ctx.web3.PublicKey.findProgramAddressSync(
    [utf8("bid"), auctionKey.toBuffer(), ctx.actor.toBuffer(), u64(bidId)],
    ctx.programId
  );
  return {
    instruction: new ctx.web3.TransactionInstruction({
      programId: ctx.programId,
      keys: [
        { pubkey: ctx.actor, isSigner: true, isWritable: true },
        { pubkey: auctionKey, isSigner: false, isWritable: true },
        { pubkey: bidPda, isSigner: false, isWritable: true },
        {
          pubkey: new ctx.web3.PublicKey(SYSTEM_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: concatBytes(
        await discriminator("submit_bid_receipt"),
        u64(bidId),
        encryptedBidHash,
        u64(quantity)
      ),
    }),
    afterConfirm: async () => {
      const account = await fetchDecodedAccount(ctx, bidPda, "BidReceipt");
      return {
        onchainAddress: bidPda.toBase58(),
        onchainType: "BidReceipt",
        summary: "Bid receipt created on-chain.",
        onchainData: account,
        encryptedPreview: escapePayload(payload),
      };
    },
  };
}

async function buildOpenPosition(form, ctx) {
  const positionId = autoIdFromField(form, "position id");
  const marketLabel = fieldValue(form, "market") || "SOL / USDC";
  const side = fieldValue(form, "side") || "Long";
  const size = fieldValue(form, "size");
  const leverage = fieldValue(form, "leverage");
  const publicMargin = parseUnits(fieldValue(form, "collateral"), 6);
  const payload = JSON.stringify({
    marketLabel,
    side,
    size,
    leverage,
    slippage: fieldValue(form, "slippage"),
  });
  const encryptedPositionHash = await sha256Bytes(utf8(payload));
  const [positionPda] = ctx.web3.PublicKey.findProgramAddressSync(
    [utf8("position"), ctx.actor.toBuffer(), u64(positionId)],
    ctx.programId
  );
  return {
    instruction: new ctx.web3.TransactionInstruction({
      programId: ctx.programId,
      keys: [
        { pubkey: ctx.actor, isSigner: true, isWritable: true },
        { pubkey: positionPda, isSigner: false, isWritable: true },
        {
          pubkey: new ctx.web3.PublicKey(SYSTEM_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: concatBytes(
        await discriminator("open_private_position"),
        u64(positionId),
        stringBytes(`${marketLabel} ${side}`),
        encryptedPositionHash,
        u64(publicMargin)
      ),
    }),
    afterConfirm: async () => {
      const account = await fetchDecodedAccount(
        ctx,
        positionPda,
        "PrivatePosition"
      );
      return {
        onchainAddress: positionPda.toBase58(),
        onchainType: "PrivatePosition",
        summary: "Private position opened on-chain.",
        onchainData: account,
        encryptedPreview: escapePayload(payload),
      };
    },
  };
}

async function buildBorrow(form, ctx) {
  const obligationId = autoIdFromField(form, "obligation id");
  const reserveLabel = fieldValue(form, "reserve") || "SOL / USDC";
  const publicCollateral = parseUnits(fieldValue(form, "amount"), 6);
  const payload = JSON.stringify({
    action: fieldValue(form, "action"),
    reserveLabel,
    amount: fieldValue(form, "amount"),
    healthMode: fieldValue(form, "health mode"),
  });
  const encryptedDebtHash = await sha256Bytes(utf8(payload));
  const [obligationPda] = ctx.web3.PublicKey.findProgramAddressSync(
    [utf8("obligation"), ctx.actor.toBuffer(), u64(obligationId)],
    ctx.programId
  );
  return {
    instruction: new ctx.web3.TransactionInstruction({
      programId: ctx.programId,
      keys: [
        { pubkey: ctx.actor, isSigner: true, isWritable: true },
        { pubkey: obligationPda, isSigner: false, isWritable: true },
        {
          pubkey: new ctx.web3.PublicKey(SYSTEM_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: concatBytes(
        await discriminator("open_private_borrow"),
        u64(obligationId),
        stringBytes(reserveLabel),
        u64(publicCollateral),
        encryptedDebtHash
      ),
    }),
    afterConfirm: async () => {
      const account = await fetchDecodedAccount(
        ctx,
        obligationPda,
        "Obligation"
      );
      return {
        onchainAddress: obligationPda.toBase58(),
        onchainType: "Obligation",
        summary: "Private borrow obligation created on-chain.",
        onchainData: account,
        encryptedPreview: escapePayload(payload),
      };
    },
  };
}

async function buildRegisterIdentifier(form, ctx) {
  const identifier =
    fieldValue(form, "email") || fieldValue(form, "identifier");
  const normalized = normalizeContact(identifier);
  const commitmentId = autoIdFromField(form, "commitment id");
  const commitmentHash = await sha256Bytes(utf8(normalized));
  const [commitmentPda] = ctx.web3.PublicKey.findProgramAddressSync(
    [utf8("identifier"), ctx.actor.toBuffer(), u64(commitmentId)],
    ctx.programId
  );
  return {
    instruction: new ctx.web3.TransactionInstruction({
      programId: ctx.programId,
      keys: [
        { pubkey: ctx.actor, isSigner: true, isWritable: true },
        { pubkey: commitmentPda, isSigner: false, isWritable: true },
        {
          pubkey: new ctx.web3.PublicKey(SYSTEM_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: concatBytes(
        await discriminator("register_identifier"),
        u64(commitmentId),
        commitmentHash
      ),
    }),
    afterConfirm: async () => {
      const account = await fetchDecodedAccount(
        ctx,
        commitmentPda,
        "IdentifierCommitment"
      );
      return {
        onchainAddress: commitmentPda.toBase58(),
        onchainType: "IdentifierCommitment",
        summary: "Identifier commitment registered on-chain.",
        onchainData: account,
        normalizedIdentifier: normalized,
        identifierHash: hex(commitmentHash),
      };
    },
  };
}

async function buildDiscoveryRequest(form, ctx) {
  const requestId = autoIdFromField(form, "request id");
  const contacts = splitContacts(fieldValue(form, "contacts"));
  const contactHashes = await Promise.all(
    contacts.map(async (contact) => ({
      contact,
      normalized: normalizeContact(contact),
      hash: await hashText(normalizeContact(contact)),
    }))
  );
  const encryptedSetHash = await sha256Bytes(
    utf8(contactHashes.map((item) => item.hash).join("|"))
  );
  const maxContacts = parseInteger(
    fieldValue(form, "max contacts"),
    contacts.length
  );
  const [requestPda] = ctx.web3.PublicKey.findProgramAddressSync(
    [utf8("request"), ctx.actor.toBuffer(), u64(requestId)],
    ctx.programId
  );
  return {
    instruction: new ctx.web3.TransactionInstruction({
      programId: ctx.programId,
      keys: [
        { pubkey: ctx.actor, isSigner: true, isWritable: true },
        { pubkey: requestPda, isSigner: false, isWritable: true },
        {
          pubkey: new ctx.web3.PublicKey(SYSTEM_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: concatBytes(
        await discriminator("submit_discovery_request"),
        u64(requestId),
        encryptedSetHash,
        u16(maxContacts)
      ),
    }),
    afterConfirm: async () => {
      const account = await fetchDecodedAccount(
        ctx,
        requestPda,
        "DiscoveryRequest"
      );
      const commitments = await fetchCommitments(ctx);
      const matches = contactHashes
        .filter((item) =>
          commitments.some(
            (commitment) => commitment.commitmentHash === item.hash
          )
        )
        .map((item) => item.contact);
      return {
        onchainAddress: requestPda.toBase58(),
        onchainType: "DiscoveryRequest",
        summary: `${matches.length} global commitment match${
          matches.length === 1 ? "" : "es"
        } found.`,
        onchainData: account,
        contacts,
        contactHashes,
        matches,
      };
    },
  };
}

async function buildRecordAction(form, ctx, kind, summary) {
  const actionId = autoId();
  const [receiptPda] = ctx.web3.PublicKey.findProgramAddressSync(
    [utf8("action"), ctx.actor.toBuffer(), u64(actionId)],
    ctx.programId
  );
  const payloadHash = await hashPayload(form);
  return {
    instruction: new ctx.web3.TransactionInstruction({
      programId: ctx.programId,
      keys: [
        { pubkey: ctx.actor, isSigner: true, isWritable: true },
        { pubkey: receiptPda, isSigner: false, isWritable: true },
        {
          pubkey: new ctx.web3.PublicKey(SYSTEM_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: concatBytes(
        await discriminator("record_action"),
        u64(actionId),
        u8(kind),
        payloadHash
      ),
    }),
    afterConfirm: async () => {
      const account = await fetchDecodedAccount(
        ctx,
        receiptPda,
        "ActionReceipt"
      );
      return {
        onchainAddress: receiptPda.toBase58(),
        onchainType: "ActionReceipt",
        summary,
        onchainData: account,
      };
    },
  };
}

async function loadContactMatches(form) {
  const requestAddress = fieldValue(form, "discovery request account");
  const records = readRecords();
  const discovery = requestAddress
    ? records.find(
        (record) => record.snapshot?.onchainAddress === requestAddress
      )
    : records.find(
        (record) => record.snapshot?.onchainType === "DiscoveryRequest"
      );
  if (!discovery) {
    throw new Error("No local discovery request found for this wallet.");
  }
  const web3 = await getWeb3();
  const connection = new web3.Connection(
    state.config?.rpcUrl || RPC_URL,
    "confirmed"
  );
  const ctx = {
    web3,
    connection,
    programId: new web3.PublicKey(
      state.config?.programId || currentProgramId()
    ),
  };
  const commitments = await fetchCommitments(ctx);
  const matches = (discovery.snapshot?.contactHashes || [])
    .filter((item) =>
      commitments.some((commitment) => commitment.commitmentHash === item.hash)
    )
    .map((item) => item.contact);
  return {
    readOnly: true,
    onchainAddress: discovery.snapshot?.onchainAddress || requestAddress,
    onchainType: "DiscoveryRequest",
    summary: `${matches.length} visible match${
      matches.length === 1 ? "" : "es"
    } loaded from live commitments.`,
    matches,
    contacts: discovery.snapshot?.contacts || [],
  };
}

async function sendInstruction(instruction, ctx) {
  const tx = new ctx.web3.Transaction().add(instruction);
  tx.feePayer = ctx.actor;
  tx.recentBlockhash = (
    await ctx.connection.getLatestBlockhash("confirmed")
  ).blockhash;
  if (state.provider.signAndSendTransaction) {
    const result = await state.provider.signAndSendTransaction(tx);
    const signature = typeof result === "string" ? result : result.signature;
    await ctx.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }
  const signed = await state.provider.signTransaction(tx);
  const signature = await ctx.connection.sendRawTransaction(signed.serialize());
  await ctx.connection.confirmTransaction(signature, "confirmed");
  return signature;
}

async function fetchDecodedAccount(ctx, address, type) {
  const account = await ctx.connection.getAccountInfo(address, "confirmed");
  if (!account) throw new Error(`${type} account was not found after confirm.`);
  return decodeAccount(type, account.data);
}

async function fetchCommitments(ctx) {
  const accounts = await ctx.connection.getProgramAccounts(ctx.programId, {
    commitment: "confirmed",
  });
  const discriminatorBytes = await accountDiscriminator("IdentifierCommitment");
  return accounts
    .filter((entry) => matchesPrefix(entry.account.data, discriminatorBytes))
    .map((entry) => ({
      address: entry.pubkey.toBase58(),
      ...decodeAccount("IdentifierCommitment", entry.account.data),
    }));
}

function decodeAccount(type, bytes) {
  const cursor = createCursor(bytes);
  cursor.skip(8);
  if (type === "Auction") {
    return {
      seller: cursor.pubkey(),
      auctionId: cursor.u64(),
      title: cursor.string(),
      asset: cursor.string(),
      mode: cursor.u8(),
      reservePrice: cursor.u64(),
      supply: cursor.u64(),
      endTs: cursor.i64(),
      bidCount: cursor.u32(),
      status: cursor.u8(),
      bump: cursor.u8(),
    };
  }
  if (type === "BidReceipt") {
    return {
      auction: cursor.pubkey(),
      bidder: cursor.pubkey(),
      bidId: cursor.u64(),
      encryptedBidHash: cursor.hex(32),
      quantity: cursor.u64(),
      bump: cursor.u8(),
    };
  }
  if (type === "PrivatePosition") {
    return {
      owner: cursor.pubkey(),
      marketLabel: cursor.string(),
      positionId: cursor.u64(),
      encryptedPositionHash: cursor.hex(32),
      publicMargin: cursor.u64(),
      status: cursor.u8(),
      bump: cursor.u8(),
    };
  }
  if (type === "Obligation") {
    return {
      owner: cursor.pubkey(),
      reserveLabel: cursor.string(),
      obligationId: cursor.u64(),
      publicCollateralAmount: cursor.u64(),
      encryptedDebtHash: cursor.hex(32),
      status: cursor.u8(),
      bump: cursor.u8(),
    };
  }
  if (type === "IdentifierCommitment") {
    return {
      owner: cursor.pubkey(),
      commitmentId: cursor.u64(),
      commitmentHash: cursor.hex(32),
      createdTs: cursor.i64(),
      bump: cursor.u8(),
    };
  }
  if (type === "DiscoveryRequest") {
    return {
      requester: cursor.pubkey(),
      requestId: cursor.u64(),
      encryptedSetHash: cursor.hex(32),
      maxContacts: cursor.u16(),
      status: cursor.u8(),
      bump: cursor.u8(),
    };
  }
  if (type === "ActionReceipt") {
    return {
      actor: cursor.pubkey(),
      actionId: cursor.u64(),
      actionType: cursor.u8(),
      payloadHash: cursor.hex(32),
      createdTs: cursor.i64(),
      bump: cursor.u8(),
    };
  }
  throw new Error(`Unknown account type: ${type}`);
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
    <h2>Local draft + on-chain receipt</h2>
    <p class="muted">Each action keeps private user input in this browser and links it to a live Solana account or transaction when available.</p>
    <div class="local-insight" data-local-insight></div>
    <div class="activity" data-local-records></div>`;
  layout.append(panel);
}

async function saveLocalRecord(form, signature, snapshot = {}) {
  const record = {
    id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    action: form.getAttribute("data-action-form") || "Action",
    createdAt: new Date().toISOString(),
    wallet: state.publicKey,
    signature,
    explorer: signature ? explorerTx(signature) : "",
    fields: collectFields(form),
    payloadHash: hex(await hashPayload(form)),
    snapshot,
  };
  const enriched = await enrichContactRecord(record);
  const records = readRecords();
  records.unshift(enriched);
  writeRecords(records.slice(0, 80));
}

function collectFields(form) {
  return [...form.querySelectorAll("input, select, textarea")]
    .map((node) => ({
      label: cleanLabel(
        node.closest("label")?.textContent || node.name || "Input"
      ),
      value: node.value.trim(),
    }))
    .filter((field) => field.value);
}

async function enrichContactRecord(record) {
  if (!isContactApp()) return record;
  const action = record.action.toLowerCase();
  if (action.includes("register")) {
    return {
      ...record,
      privateType: "registered-identifier",
      identifierHash:
        record.snapshot?.identifierHash ||
        record.snapshot?.onchainData?.commitmentHash,
      normalizedIdentifier: record.snapshot?.normalizedIdentifier || "",
    };
  }
  if (action.includes("discover") || action.includes("view matches")) {
    return {
      ...record,
      privateType: "discovery-request",
      matches: record.snapshot?.matches || [],
    };
  }
  return record;
}

function renderLocalWorkspace() {
  const list = document.querySelector("[data-local-records]");
  const insight = document.querySelector("[data-local-insight]");
  if (!list || !insight) return;
  const records = readRecords();
  insight.innerHTML = renderInsight(records);
  list.replaceChildren();
  if (!records.length) {
    list.innerHTML = `<article class="activity-item"><strong>No local actions yet</strong><p>Connect a wallet, submit a form, and the resulting on-chain account or explorer receipt will appear here.</p></article>`;
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
    const latest = records.find((record) => (record.matches || []).length);
    const matches = latest?.matches || [];
    return `<div class="mini-grid"><div><strong>${
      records.filter((record) => record.privateType === "registered-identifier")
        .length
    }</strong><span>Commitments signed</span></div><div><strong>${
      matches.length
    }</strong><span>Global matches found</span></div></div>${
      matches.length
        ? `<p class="match-list">${matches.map(escapeHtml).join(", ")}</p>`
        : `<p class="muted">Discovery compares your local contact hashes against live on-chain commitments.</p>`
    }`;
  }
  const latest = records[0];
  return `<div class="mini-grid"><div><strong>${
    records.length
  }</strong><span>Saved actions</span></div><div><strong>${escapeHtml(
    latest?.snapshot?.onchainType || latest?.action || "None"
  )}</strong><span>Latest on-chain object</span></div></div><p class="muted">${
    latest?.snapshot?.onchainAddress
      ? escapeHtml(short(latest.snapshot.onchainAddress))
      : "The workspace stores local drafts and real chain references together."
  }</p>`;
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
  const chainData = renderChainData(record.snapshot?.onchainData || {});
  const matches = (record.matches || record.snapshot?.matches || []).length
    ? `<p class="match-list">Matches: ${[
        ...(record.matches || record.snapshot.matches),
      ]
        .map(escapeHtml)
        .join(", ")}</p>`
    : "";
  const explorer = record.signature
    ? `<a href="${
        record.explorer
      }" target="_blank" rel="noreferrer">${escapeHtml(
        short(record.signature)
      )}</a>`
    : "Read-only result";
  return `<strong>${escapeHtml(
    record.action
  )}</strong><p>${explorer} · ${new Date(
    record.createdAt
  ).toLocaleString()}</p><p class="muted">${
    record.snapshot?.summary ? escapeHtml(record.snapshot.summary) : ""
  }</p>${matches}${chainData}<ul class="record-fields">${fields}</ul><p class="muted">Payload hash: ${escapeHtml(
    record.payloadHash.slice(0, 16)
  )}...</p>`;
}

function renderChainData(data) {
  const entries = Object.entries(data).slice(0, 5);
  if (!entries.length) return "";
  const rows = entries
    .map(
      ([key, value]) =>
        `<li><span>${escapeHtml(humanizeKey(key))}</span><strong>${escapeHtml(
          String(value)
        )}</strong></li>`
    )
    .join("");
  return `<ul class="record-fields">${rows}</ul>`;
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
  const program =
    state.config?.programId || currentProgramId() || location.host;
  const wallet = state.publicKey || "disconnected";
  return `arcium-dapp:${program}:${wallet}`;
}

function currentProgramId() {
  return state.config?.programId || state.config?.program_id || "";
}

function currentApp() {
  const programId = currentProgramId();
  if (programId === PROGRAMS.blind) return "blind";
  if (programId === PROGRAMS.perps) return "perps";
  if (programId === PROGRAMS.lending) return "lending";
  if (programId === PROGRAMS.contact) return "contact";
  return "unknown";
}

function isContactApp() {
  return currentApp() === "contact";
}

function fieldValue(form, name) {
  const lowered = name.toLowerCase();
  const label = [...form.querySelectorAll("label")].find((node) =>
    node.textContent.toLowerCase().includes(lowered)
  );
  return label?.querySelector("input, select, textarea")?.value?.trim() || "";
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseUnits(value, decimals = 6) {
  const normalized = String(value || "").trim();
  if (!normalized) return 0n;
  const [whole, fraction = ""] = normalized.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function autoId() {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
}

function autoIdFromField(form, fieldName) {
  const explicit = fieldValue(form, fieldName);
  return explicit ? BigInt(explicit) : autoId();
}

function modeIndex(value) {
  const lowered = String(value || "").toLowerCase();
  if (lowered.includes("vickrey")) return 1;
  if (lowered.includes("uniform")) return 2;
  return 0;
}

function requiredPublicKey(value, web3) {
  if (!value) throw new Error("A valid on-chain account address is required.");
  return new web3.PublicKey(value);
}

function splitContacts(value) {
  return String(value || "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeContact(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "");
}

async function hashText(value) {
  return hex(await sha256Bytes(utf8(value)));
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
  return sha256Bytes(utf8(values));
}

async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function discriminator(name) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8(`global:${name}`))
  ).slice(0, 8);
}

async function accountDiscriminator(name) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8(`account:${name}`))
  ).slice(0, 8);
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

function stringBytes(value) {
  const raw = utf8(value);
  return concatBytes(u32(raw.length), raw);
}

function u8(value) {
  return new Uint8Array([Number(value)]);
}

function u16(value) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, Number(value), true);
  return out;
}

function u32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, Number(value), true);
  return out;
}

function u64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}

function i64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, BigInt(value), true);
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

function createCursor(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  return {
    skip(length) {
      offset += length;
    },
    u8() {
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    u16() {
      const value = view.getUint16(offset, true);
      offset += 2;
      return value;
    },
    u32() {
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    },
    u64() {
      const value = view.getBigUint64(offset, true);
      offset += 8;
      return value.toString();
    },
    i64() {
      const value = view.getBigInt64(offset, true);
      offset += 8;
      return value.toString();
    },
    bytes(length) {
      const value = bytes.slice(offset, offset + length);
      offset += length;
      return value;
    },
    hex(length) {
      return hex(this.bytes(length));
    },
    pubkey() {
      const value = this.bytes(32);
      const array = Array.from(value);
      return array.map((entry) => entry.toString(16).padStart(2, "0")).join("");
    },
    string() {
      const length = this.u32();
      return new TextDecoder().decode(this.bytes(length));
    },
  };
}

function matchesPrefix(data, prefix) {
  if (data.length < prefix.length) return false;
  return prefix.every((value, index) => data[index] === value);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return hex(bytes);
}

function escapePayload(payload) {
  return payload.length > 160 ? `${payload.slice(0, 157)}...` : payload;
}

function cleanLabel(value) {
  return String(value)
    .replace(/Connect a wallet to continue/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeKey(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
