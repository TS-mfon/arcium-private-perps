use anchor_lang::prelude::*;

#[account]
pub struct Market {
    pub authority: Pubkey,
    pub market_id: u64,
    pub symbol: String,
    pub max_leverage_bps: u16,
    pub maintenance_margin_bps: u16,
    pub status: u8,
    pub bump: u8,
}

impl Market {
    pub const MAX_SYMBOL: usize = 24;
    pub const SPACE: usize = 8 + 32 + 8 + 4 + Self::MAX_SYMBOL + 2 + 2 + 1 + 1;
}

#[account]
pub struct PrivatePosition {
    pub owner: Pubkey,
    pub market_label: String,
    pub position_id: u64,
    pub encrypted_position_hash: [u8; 32],
    pub public_margin: u64,
    pub status: u8,
    pub bump: u8,
}

impl PrivatePosition {
    pub const MAX_MARKET_LABEL: usize = 24;
    pub const SPACE: usize = 8 + 32 + 4 + Self::MAX_MARKET_LABEL + 8 + 32 + 8 + 1 + 1;
}

#[account]
pub struct ActionReceipt {
    pub actor: Pubkey,
    pub action_id: u64,
    pub action_type: u8,
    pub payload_hash: [u8; 32],
    pub created_ts: i64,
    pub bump: u8,
}

impl ActionReceipt {
    pub const SPACE: usize = 8 + 32 + 8 + 1 + 32 + 8 + 1;
}
