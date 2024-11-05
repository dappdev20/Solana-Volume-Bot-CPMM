import { TAX_AMOUNT } from "../bot/const";

interface TokenDetails {
	name: string;
	symbol: string;
	totalSupply: string;
	decimals: number;
	price: number;
	marketcap: number;
}

export const BOT_STATUS = {
	NOT_STARTED: 0,
	ARCHIVED_TARGET_VOLUME: 1,
	RUNNING: 2,
	STOPPED_DUE_TO_MAIN_WALLET_BALANCE: 3,
	STOPPED_DUE_TO_SUB_WALLETS_BALANCE: 4,
	STOPPED_DUE_TO_OTHER_ERROR: 5,
	STOPPED_DUE_TO_SIMULATION_ERROR: 6,
	STOPPED_BY_USER: 7,
};

interface BotStats {
	workedSeconds: number;
	volumeMade: number;
	targetVolume: number;
	holderMade: number;
	targetHD: number;
	marketMakerMade: number;
	targetMM: number;
	subWalletNums: number;
	status: number;
	statusHD: number;
	statusMM: number;
	startStopFlag: number;
	startStopFlagHD: number;
	startStopFlagMM: number;
	buyAmount: { type: number, default: 0.001 };
}

interface WalletInfo {
	address: string; // publicKey
	balance: number; // Balance in SOL
}

// interface PairDetails {
// 	address: string;
// }

/**
 * Formats a given number of seconds into a readable time string.
 * @param totalSeconds The total number of seconds.
 * @returns A string representing the formatted time like "3m 13s", "13h 25m 34s", etc.
 */
function formatTime(totalSeconds: number): string {
	const days = Math.floor(totalSeconds / (3600 * 24));
	const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	let result = "";

	if (days > 0) {
		result += `${days} d `;
	}
	if (days > 0 || hours > 0) {
		result += `${hours} h `;
	}
	if (days > 0 || hours > 0 || minutes > 0) {
		result += `${minutes} m `;
	}
	if (days > 0 || hours > 0 || minutes > 0 || seconds >= 0) {
		result += `${seconds} s`;
	}

	return result.trim(); // Remove any trailing space
}

/**
 * Formats a USD amount into a more readable string with abbreviations.
 * @param amount The amount of USD as a number.
 * @returns A formatted string with the amount abbreviated in a readable format.
 */
function formatUSD(amount: number): string {
	if (amount >= 1_000_000_000) {
		return `${(amount / 1_000_000_000).toFixed(2)}B USD`;
	} else if (amount >= 1_000_000) {
		return `${(amount / 1_000_000).toFixed(2)}M USD`;
	} else if (amount >= 1_000) {
		return `${(amount / 1_000).toFixed(2)}k USD`;
	} else {
		return `${amount.toFixed(2)} USD`;
	}
}

export function generateSolanaBotMessage(
	tokenAddress: string,
	tokenDetails: TokenDetails,
	botStats: BotStats,
	walletInfo: WalletInfo,
	coupon: number,
): string {

	let depositSol: number = 0.5;
	if (coupon > 0)
		depositSol = depositSol + TAX_AMOUNT * coupon / 100;
	return `🏅 Welcome to ${process.env.BOT_TITLE} 🏅.
The fastest and most efficient auto volume bot on Solana.

		🟢 Token address: 
			<code>${tokenAddress}</code>
		🔗 Pair : ${tokenDetails.symbol} / SOL
		💵 Price: $${tokenDetails.price}
		💹 Market Cap: $${tokenDetails.marketcap}

		🎚️ Target Volume: ${formatUSD(botStats.targetVolume)}
		💸 Buy SOL Amount: ${botStats.buyAmount} SOL
		
		⌛ Bot worked: ${formatTime(botStats.workedSeconds)}
		💹 Bot made: ${formatUSD(botStats.volumeMade)}
		
		💳 Your Deposit Wallet: 
			<code>${walletInfo.address}</code>
		💰 Balance: ${(Number(walletInfo.balance) / 10 ** 9)?.toFixed(9)} SOL
		Please deposit ${depositSol} SOL at least into this wallet.
		`;
}
