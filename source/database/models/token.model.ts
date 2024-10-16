import mongoose from "mongoose";

const contractSchema = new mongoose.Schema({
	address: String,
	name: String,
	symbol: String,
	decimals: Number,
	totalSupply: String
});

export default mongoose.model("Token", contractSchema);
