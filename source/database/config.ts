import mongoose from "mongoose";
const MONGO_URI = "mongodb://127.0.0.1/spl_volume_bot1";

export function connectDatabase(callback: any): void {
	mongoose.connect(MONGO_URI, {}).then(() => {
		console.log("Mongoose Connected");
		if (callback) callback();
	});
}
