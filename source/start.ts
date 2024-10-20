import { generateWallets, start, main } from "./bot/index";
import { connectDatabase } from "./database/config";
// eslint-disable-next-line @typescript-eslint/no-floating-promises
connectDatabase(() => {
	generateWallets();
	start();
	main();
});

// Gracefully stop the process on SIGINT
process.on("SIGINT", () => {
	console.log("Quitting the Telegram bot...");
	// Additional cleanup or shutdown tasks can be performed here
	process.exit(0); // Exit the process
});
