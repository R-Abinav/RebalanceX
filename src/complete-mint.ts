/**
 * Complete Sepolia → Polygon Amoy mint
 */
import { ethers } from 'ethers';
import { CHAINS, MESSAGE_TRANSMITTER_ABI, getPrivateKey } from './config.js';
import { logger } from './logger.js';

// Attestation for Sepolia → Polygon Amoy (10 USDC)
const ATTESTATION = '0xb31dc7235f75624899a203595f2ca6deaaf107857095452ed8dce27d7f31a5c30ef6efa6b64aca2d1828f9f619bf3d44508af8f71ed1e400c7f0a184871dfc641bd2cc5c11fa6206ca6334290169539f8c64f147f24787a0a0220cca825757392c03d3dad581a17f1f3c6cde03bcbaeb346df7b82f556f09b146cd69e326a3c8fd1c';
const MESSAGE = '0x00000001000000000000000737bfaddc3fb73b1a43f5c622ce5403ac95226cb48385ad4478ee236edbfd00b60000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000000000000000000000000000000000000000000000000007d0000007d0000000010000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c7238000000000000000000000000c05a0ad92f69ff2171679b92d6928c768ec381aa0000000000000000000000000000000000000000000000000000000000989680000000000000000000000000c05a0ad92f69ff2171679b92d6928c768ec381aa000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

async function main() {
    // Mint on Polygon Amoy (destination)
    const chain = CHAINS.polygonAmoy;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const wallet = new ethers.Wallet(getPrivateKey(), provider);

    logger.info('Step 4/4: Minting USDC on destination chain...');
    logger.info(`Chain: ${chain.name}`);
    logger.info(`Wallet: ${wallet.address}`);

    const messageTransmitter = new ethers.Contract(
        chain.messageTransmitter,
        MESSAGE_TRANSMITTER_ABI,
        wallet
    );

    try {
        logger.info('Calling receiveMessage...');
        const tx = await messageTransmitter.getFunction('receiveMessage')(MESSAGE, ATTESTATION, {
            gasLimit: 300000n,
        });

        logger.info(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();

        logger.info('============================================================');
        logger.info('✅ TRANSFER COMPLETE!');
        logger.info('============================================================');
        logger.info(`Mint TX: ${receipt.hash}`);
        logger.info(`Gas used: ${receipt.gasUsed?.toString()}`);
        logger.info('============================================================');
    } catch (error) {
        logger.error(`❌ Mint failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

main().catch(console.error);
