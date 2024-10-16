import mongoose from "mongoose";

const volumeBotSchema = new mongoose.Schema({
	userId: Number,
	token: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Token",
	},
	mainWallet: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Wallet",
	},
	subWallets: [
		{
			type: mongoose.Schema.Types.ObjectId, // user will distrubute SOL from mail wallet into sub wallets, also he can gather SOL into main wallet again
			ref: "Wallet",
		},
	],
	subWalletNums: {
		type: Number,
		default: 5, // 5 sub wallets
	},
	addressLookupTable:{
		type: String,
		default: "",
	},
	targetVolume: {
		type: Number,
		default: 1000000, // 1 million
	},
	workedSeconds: {
		type: Number,
		default: 0,
	},
	volumeMade: {
		type: Number,
		default: 0,
	},
	volumePaid: {
		type: Number,
		default: 0,
	},
	status: {
		type: Number,
		default: 0,
	},
	startStopFlag: {
		type: Number,
		default: 0, // start: 1, stop: 0
	},
	statusHD: {
		type: Number,
		default: 0,
	},
	targetHD: {
		type: Number,
		default: 4, // 1 K
	},
	holderMade: {
		type: Number,
		default: 0,
	},
	holderPaid: {
		type: Number,
		default: 0,
	},
	startStopFlagHD: {
		type: Number,
		default: 0, // start: 1, stop: 0
	},
	statusMM: {
		type: Number,
		default: 0,
	},
	targetMM: {
		type: Number,
		default: 4, // 1 K
	},
	marketMakerMade: {
		type: Number,
		default: 0,
	},
	marketMakerPaid: {
		type: Number,
		default: 0,
	},
	startStopFlagMM: {
		type: Number,
		default: 0, // start: 1, stop: 0
	},
	allowed: {
		type: Number,
		default: 0, // start: 1, stop: 0
	}
});

export default mongoose.model("VolumeBot", volumeBotSchema);
