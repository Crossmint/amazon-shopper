import { createInterface } from "node:readline";
import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";

// GOAT Plugins
import { getOnChainTools } from "@goat-sdk/adapter-vercel-ai";
import { crossmintHeadlessCheckout } from "@goat-sdk/plugin-crossmint-headless-checkout";

import "dotenv/config";

import { http } from "viem";
import { createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { viem } from "@goat-sdk/wallet-viem";
import { USDC, erc20 } from "@goat-sdk/plugin-erc20";


const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account: account,
  transport: http(process.env.RPC_PROVIDER_URL),
  chain: base,
});


const apiKey = process.env.CROSSMINT_API_KEY;
if (!apiKey) {
  throw new Error("CROSSMINT_API_KEY is not set");
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

const conversationHistory: ChatMessage[] = [];

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const getUserInput = () => {
  return new Promise<string>((resolve) => {
    rl.question("You: ", (input) => {
      resolve(input);
    });
  });
};

(async () => {
  try {
    const tools = await getOnChainTools({
      wallet: viem(walletClient),
      plugins: [
        erc20({ tokens: [USDC] }), // Enable ERC20 token operations
        crossmintHeadlessCheckout({ apiKey: apiKey as string }),
      ],
    });

    console.clear();
    console.log("👋 Welcome! How can I assist you with your shopping today?");
    console.log("Type 'exit' to end the conversation.\n");

    while (true) {
      const userInput = await getUserInput();

      if (userInput.toLowerCase() === "exit") {
        console.log("\n👋 Thanks for shopping with us! Have a great day!");
        rl.close();
        break;
      }

      conversationHistory.push({
        role: "user",
        content: userInput,
        id: `user-${Date.now()}`,
      });

      const messages: CoreMessage[] = [
        {
          role: "system",
          content: `
            No need to check the token balance of the user first.

            When fetching the wallet's balance, make sure to always convert the balance to the decimals and not base units.
            
            When buying a product:
            Always ask for ALL required information in the first response:
            1) Name
            2) Shipping address
            3) Recipient email address
            4) Payment method (USDC, SOL, or ETH)
            5) Preferred chain (EVM, Solana, Base)
            
            Only proceed with the purchase when all information is provided.
            1) Use productLocator format 'amazon:B08SVZ775L'
            2) Extract product locator from URLs
            3) Require and parse valid shipping address (in format 'Name, Street, City, State ZIP, Country') and email
            4) The recipient WILL be the email provided by the user
            5) You can get the payer address using the get_wallet_address tool
            
            Once the order is executed via the buy_token, consider the purchase complete, and the payment sent. You can ask the user if they want to purchase something else
            Don't ask to confirm payment to finalize orders.
          `,
        },
        ...conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      ];

      try {
        const result = await generateText({
          model: openai("gpt-4o-mini"),
          tools: tools,
          maxSteps: 10,
          messages,
          onStepFinish: (event) => {
            console.log(event.toolResults);
          },
        });

        conversationHistory.push({
          role: "assistant",
          content: result.text,
          id: `assistant-${Date.now()}`,
        });

        console.log("\nAssistant:", result.text, "\n");
      } catch (error) {
        console.error("Error:", error);
      }
    }
  } catch (error) {
    console.error("Fatal error:", error);
    rl.close();
    process.exit(1);
  }
})();
