import React from "react";
import ReactDOM from "react-dom/client";
import "@rainbow-me/rainbowkit/styles.css";
import { ConnectButton, RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { GIWA_SEPOLIA } from "./contract.js";
import App from "./App.jsx";
import "./style.css";

const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID;

const config = getDefaultConfig({
  appName: "GIWA FlowLab",
  projectId: wcProjectId,
  chains: [GIWA_SEPOLIA],
  ssr: false,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#ef4444",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
        >
          <App ConnectButton={ConnectButton} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
