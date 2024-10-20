import mongoose from "mongoose";

const depositWalletSchema = new mongoose.Schema({
    id: Number,
	prvKey: String,
    usedTokenIdx: [String],
    timestamp: Number,
});

const DepositWallet = mongoose.model("DepositWallet", depositWalletSchema);
export default module.exports = DepositWallet;