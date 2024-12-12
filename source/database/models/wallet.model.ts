import mongoose from "mongoose";

const contractSchema = new mongoose.Schema({
	publicKey: String,
	privateKey: String,
	userId: Number,
	username: String,
	level: {
		type: String,
		default: "Main", //  can be "Main" and "Sub"
	},
});

export default mongoose.model("Wallet", contractSchema);
