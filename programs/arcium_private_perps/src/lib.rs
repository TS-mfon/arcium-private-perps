pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
pub use constants::*;
pub use instructions::*;
#[allow(unused_imports)]
pub use state::*;

declare_id!("2HfWctJbtQTKFYnyLMHsmY5sGa3uAB6g4MVHSVWxCZ8G");

#[arcium_program]
pub mod arcium_private_perps {
    use super::*;

    pub fn init_market(
        ctx: Context<InitMarket>,
        market_id: u64,
        symbol: String,
        max_leverage_bps: u16,
        maintenance_margin_bps: u16,
    ) -> Result<()> {
        require!(symbol.len() <= Market::MAX_SYMBOL, error::ErrorCode::CustomError);
        require!(max_leverage_bps >= 10000, error::ErrorCode::CustomError);

        let market = &mut ctx.accounts.market;
        market.authority = ctx.accounts.authority.key();
        market.market_id = market_id;
        market.symbol = symbol;
        market.max_leverage_bps = max_leverage_bps;
        market.maintenance_margin_bps = maintenance_margin_bps;
        market.status = 1;
        market.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn open_private_position(
        ctx: Context<OpenPrivatePosition>,
        position_id: u64,
        market_label: String,
        encrypted_position_hash: [u8; 32],
        public_margin: u64,
    ) -> Result<()> {
        require!(market_label.len() <= PrivatePosition::MAX_MARKET_LABEL, error::ErrorCode::CustomError);
        require!(public_margin > 0, error::ErrorCode::CustomError);

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.market_label = market_label;
        position.position_id = position_id;
        position.encrypted_position_hash = encrypted_position_hash;
        position.public_margin = public_margin;
        position.status = 1;
        position.bump = ctx.bumps.position;
        Ok(())
    }

    pub fn record_action(
        ctx: Context<RecordAction>,
        action_id: u64,
        action_type: u8,
        payload_hash: [u8; 32],
    ) -> Result<()> {
        let receipt = &mut ctx.accounts.action_receipt;
        receipt.actor = ctx.accounts.actor.key();
        receipt.action_id = action_id;
        receipt.action_type = action_type;
        receipt.payload_hash = payload_hash;
        receipt.created_ts = Clock::get()?.unix_timestamp;
        receipt.bump = ctx.bumps.action_receipt;
        Ok(())
    }

    pub fn init_add_together_comp_def(ctx: Context<InitAddTogetherCompDef>) -> Result<()> {
        add_together::init_add_together_comp_def_handler(ctx)
    }

    pub fn add_together(
        ctx: Context<AddTogether>,
        computation_offset: u64,
        ciphertext_0: [u8; 32],
        ciphertext_1: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        add_together::add_together_handler(ctx, computation_offset, ciphertext_0, ciphertext_1, pub_key, nonce)
    }

    #[arcium_callback(encrypted_ix = "add_together")]
    pub fn add_together_callback(
        ctx: Context<AddTogetherCallback>,
        output: SignedComputationOutputs<AddTogetherOutput>,
    ) -> Result<()> {
        add_together::add_together_callback_handler(ctx, output)
    }
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Market::SPACE,
        seeds = [b"market", authority.key().as_ref(), &market_id.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct OpenPrivatePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = PrivatePosition::SPACE,
        seeds = [b"position", owner.key().as_ref(), &position_id.to_le_bytes()],
        bump
    )]
    pub position: Account<'info, PrivatePosition>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(action_id: u64)]
pub struct RecordAction<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(
        init,
        payer = actor,
        space = ActionReceipt::SPACE,
        seeds = [b"action", actor.key().as_ref(), &action_id.to_le_bytes()],
        bump
    )]
    pub action_receipt: Account<'info, ActionReceipt>,
    pub system_program: Program<'info, System>,
}
