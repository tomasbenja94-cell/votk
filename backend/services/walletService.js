const axios = require('axios');

/**
 * Servicio para consultar transacciones de wallets
 */
class WalletService {
  constructor() {
    // APIs de exploradores de blockchain
    this.BSCSCAN_API = 'https://api.bscscan.com/api';
    this.TRONSCAN_API = 'https://apilist.tronscan.org/api';
    
    // API Keys (pueden ser configuradas en .env)
    this.BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || 'YourApiKeyToken';
    
    // Direcciones de wallets
    this.WALLETS = {
      BEP20: '0x009d4b9Aa21A320EEB130720FE4626b79671155E',
      TRC20: 'TCFeWDZgCZQxuveQUDEEpdq9TA31itHkdM'
    };
  }

  /**
   * Obtiene transacciones de BSCScan (BEP20)
   */
  async getBSCTransactions(startBlock = 0, endBlock = 99999999) {
    try {
      const response = await axios.get(this.BSCSCAN_API, {
        params: {
          module: 'account',
          action: 'txlist',
          address: this.WALLETS.BEP20,
          startblock: startBlock,
          endblock: endBlock,
          page: 1,
          offset: 100,
          sort: 'desc',
          apikey: this.BSCSCAN_API_KEY
        },
        timeout: 10000
      });

      if (response.data.status === '1' && response.data.result) {
        // Filtrar solo transacciones entrantes (USDT)
        const incomingTxs = response.data.result.filter(tx => 
          tx.to.toLowerCase() === this.WALLETS.BEP20.toLowerCase() &&
          tx.value !== '0' &&
          tx.isError === '0'
        );

        return incomingTxs.map(tx => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: (parseInt(tx.value) / 1e18).toFixed(6), // Convertir de wei a USDT
          timestamp: parseInt(tx.timeStamp) * 1000, // Convertir a milisegundos
          blockNumber: tx.blockNumber,
          network: 'BEP20',
          explorerUrl: `https://bscscan.com/tx/${tx.hash}`
        }));
      }
      return [];
    } catch (error) {
      console.error('Error fetching BSC transactions:', error.message);
      return [];
    }
  }

  /**
   * Obtiene transacciones de TronScan (TRC20)
   */
  async getTRC20Transactions(limit = 100) {
    try {
      const response = await axios.get(`${this.TRONSCAN_API}/transaction`, {
        params: {
          address: this.WALLETS.TRC20,
          limit: limit,
          start: 0,
          sort: '-timestamp'
        },
        timeout: 10000
      });

      if (response.data && response.data.data) {
        // Filtrar solo transacciones TRC20 de USDT
        const trc20Txs = response.data.data.filter(tx => 
          tx.tokenInfo && 
          tx.tokenInfo.symbol === 'USDT' &&
          tx.to === this.WALLETS.TRC20 &&
          tx.type === 'Transfer'
        );

        return trc20Txs.map(tx => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: (parseFloat(tx.amount) / 1e6).toFixed(6), // TRC20 USDT tiene 6 decimales
          timestamp: tx.timestamp,
          blockNumber: tx.block,
          network: 'TRC20',
          explorerUrl: `https://tronscan.org/#/transaction/${tx.hash}`
        }));
      }
      return [];
    } catch (error) {
      console.error('Error fetching TRC20 transactions:', error.message);
      return [];
    }
  }

  /**
   * Obtiene todas las transacciones de ambas redes
   */
  async getAllTransactions() {
    try {
      const [bep20Txs, trc20Txs] = await Promise.all([
        this.getBSCTransactions(),
        this.getTRC20Transactions()
      ]);

      // Combinar y ordenar por timestamp descendente
      const allTxs = [...bep20Txs, ...trc20Txs].sort((a, b) => b.timestamp - a.timestamp);

      return allTxs;
    } catch (error) {
      console.error('Error fetching all transactions:', error);
      return [];
    }
  }

  /**
   * Obtiene el balance actual de las wallets
   */
  async getWalletBalances() {
    try {
      // Para BSCScan
      const bscResponse = await axios.get(this.BSCSCAN_API, {
        params: {
          module: 'account',
          action: 'tokenbalance',
          contractaddress: '0x55d398326f99059fF775485246999027B3197955', // USDT BEP20 contract
          address: this.WALLETS.BEP20,
          tag: 'latest',
          apikey: this.BSCSCAN_API_KEY
        },
        timeout: 10000
      });

      let bep20Balance = '0';
      if (bscResponse.data.status === '1') {
        bep20Balance = (parseInt(bscResponse.data.result) / 1e18).toFixed(6);
      }

      // Para TronScan (necesitaríamos usar la API de TronScan para obtener balance)
      // Por ahora retornamos solo BEP20
      return {
        BEP20: {
          address: this.WALLETS.BEP20,
          balance: bep20Balance,
          explorerUrl: `https://bscscan.com/address/${this.WALLETS.BEP20}`
        },
        TRC20: {
          address: this.WALLETS.TRC20,
          balance: '0', // Se puede implementar luego
          explorerUrl: `https://tronscan.org/#/address/${this.WALLETS.TRC20}`
        }
      };
    } catch (error) {
      console.error('Error fetching wallet balances:', error);
      return {
        BEP20: { address: this.WALLETS.BEP20, balance: '0', explorerUrl: `https://bscscan.com/address/${this.WALLETS.BEP20}` },
        TRC20: { address: this.WALLETS.TRC20, balance: '0', explorerUrl: `https://tronscan.org/#/address/${this.WALLETS.TRC20}` }
      };
    }
  }
}

module.exports = new WalletService();

