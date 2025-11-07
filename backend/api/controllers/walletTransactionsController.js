const axios = require('axios');
let Web3 = null;
try {
  const web3Module = require('web3');
  Web3 = web3Module.Web3 || web3Module.default?.Web3 || web3Module;
} catch (e) {
  console.warn('⚠️ Web3 no está disponible, se usará solo BSCScan API');
}
const config = require('../../config/default.json');

// Direcciones de las wallets
const BEP20_WALLET = '0x009d4b9Aa21A320EEB130720FE4626b79671155E';
const TRC20_WALLET = 'TCFeWDZgCZQxuveQUDEEpdq9TA31itHkdM';

// Contrato USDT en BSC (BEP20)
const USDT_BEP20_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

// API Key de BSCScan (opcional, desde config)
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || config.bscscan_api_key || null;

async function getTransactions(req, res) {
  try {
    console.log('🔄 Iniciando obtención de transacciones de wallets...');
    console.log(`🔑 BSCScan API Key configurada: ${BSCSCAN_API_KEY ? 'SÍ (' + BSCSCAN_API_KEY.substring(0, 10) + '...)' : 'NO'}`);
    const transactions = [];
    
    // Obtener transacciones BEP20 (BSC) - usar endpoint tokentx para obtener transacciones de tokens
    const bep20Promise = (async () => {
      try {
        console.log(`📡 Consultando transacciones BEP20 para wallet: ${BEP20_WALLET}`);
        console.log(`📡 Contrato USDT BEP20: ${USDT_BEP20_CONTRACT}`);
        
        // Usar el endpoint tokentx para obtener transacciones de tokens USDT
        const apiKey = BSCSCAN_API_KEY || 'XMBQN2IXNP45DUQDFMZXEY1AQDQUWRUPDV';
        const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_BEP20_CONTRACT}&address=${BEP20_WALLET}&sort=desc&apikey=${apiKey}`;
        
        console.log(`🔄 Consultando BSCScan con endpoint tokentx...`);
        const response = await axios.get(url, {
          timeout: 30000
        });
        
        if (response.data && response.data.status === '1' && Array.isArray(response.data.result)) {
          console.log(`✅ BSCScan API funcionó - ${response.data.result.length} transacciones de tokens encontradas`);
          
          // Filtrar solo transacciones entrantes (to = nuestra wallet)
          const bscTransactions = response.data.result.filter(tx => {
            const isIncoming = tx.to && tx.to.toLowerCase() === BEP20_WALLET.toLowerCase();
            const isUSDT = tx.contractAddress && tx.contractAddress.toLowerCase() === USDT_BEP20_CONTRACT.toLowerCase();
            return isIncoming && isUSDT;
          });
          
          console.log(`✅ BSCScan - ${bscTransactions.length} transacciones USDT entrantes encontradas`);
          
          // Convertir a formato estándar
          return bscTransactions.map(tx => ({
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value || '0',
            tokenDecimal: tx.tokenDecimal || 18,
            timeStamp: tx.timeStamp,
            status: tx.txreceipt_status === '1' ? '1' : '0',
            confirmed: tx.txreceipt_status === '1'
          }));
        } else {
          console.log(`⚠️ BSCScan API no retornó resultados válidos`);
          console.log(`📊 Respuesta:`, response.data);
          return [];
        }
      } catch (bscError) {
        console.error(`❌ Error consultando BSCScan: ${bscError.message}`);
        if (bscError.response) {
          console.error(`❌ BSCScan Error Response:`, JSON.stringify(bscError.response.data, null, 2));
        }
        return [];
      }
    })();
    
    // Ejecutar BEP20 con timeout
    const bep20Transactions = await Promise.race([
      bep20Promise,
      new Promise(resolve => setTimeout(() => {
        console.log('⏱️ Timeout en consulta BEP20, continuando con TRC20...');
        resolve([]);
      }, 30000)) // Timeout de 30 segundos para BEP20
    ]);
    
    // Agregar transacciones BEP20 al array
    bep20Transactions.forEach(tx => {
      transactions.push({
        ...tx,
        network: 'BEP20'
      });
    });
    
    console.log(`✅ Procesadas ${bep20Transactions.length} transacciones BEP20`);

    // Obtener transacciones TRC20 (TRON) - obtener todas las históricas
    try {
      console.log(`📡 Consultando Tronscan/TronGrid para wallet: ${TRC20_WALLET}`);
      // Intentar con Tronscan primero
      let allTronTransactions = [];
      let start = 0;
      let limit = 200; // Máximo por request en Tronscan
      let hasMore = true;
      let attempts = 0;
      const maxAttempts = 500; // Máximo 100k transacciones (500 * 200)
      
      while (hasMore && attempts < maxAttempts) {
        try {
          const tronResponse = await axios.get('https://apilist.tronscan.org/api/transaction', {
            params: {
              address: TRC20_WALLET,
              limit: limit,
              start: start
            },
            timeout: 30000
          });

          if (tronResponse.data && tronResponse.data.data && tronResponse.data.data.length > 0) {
            // Filtrar solo transacciones TRC20 de USDT entrantes
            const tronTransactions = tronResponse.data.data.filter(tx => {
              const isTRC20 = tx.contractRet === 'SUCCESS' && tx.contractType === 31;
              const isUSDT = tx.tokenInfo && tx.tokenInfo.symbol === 'USDT';
              const isIncoming = tx.to === TRC20_WALLET;
              return isTRC20 && isUSDT && isIncoming;
            });

            if (tronTransactions.length === 0) {
              hasMore = false;
            } else {
              allTronTransactions = allTronTransactions.concat(tronTransactions);
              start += limit;
              attempts++;
              
              // Si obtenemos menos del límite, no hay más
              if (tronResponse.data.data.length < limit) {
                hasMore = false;
              }
            }
          } else {
            hasMore = false;
          }
        } catch (pageError) {
          console.warn(`Error fetching TRON page ${start}:`, pageError.message);
          hasMore = false;
        }
      }
      
      // Si no obtuvimos resultados con Tronscan, intentar con TronGrid
      if (allTronTransactions.length === 0) {
        try {
          let startToken = null;
          let hasMoreTronGrid = true;
          let tronGridAttempts = 0;
          const maxTronGridAttempts = 500;
          
          while (hasMoreTronGrid && tronGridAttempts < maxTronGridAttempts) {
            const params = {
              limit: 200,
              only_confirmed: true
            };
            if (startToken) {
              params.fingerprint = startToken;
            }
            
            const altTronResponse = await axios.get(`https://api.trongrid.io/v1/accounts/${TRC20_WALLET}/transactions/trc20`, {
              params: params,
              timeout: 30000
            });

            if (altTronResponse.data && altTronResponse.data.data && altTronResponse.data.data.length > 0) {
              const tronTransactions = altTronResponse.data.data.filter(tx => {
                const isUSDT = tx.token_info && tx.token_info.symbol === 'USDT';
                const isIncoming = tx.to && tx.to.toLowerCase() === TRC20_WALLET.toLowerCase();
                return isUSDT && isIncoming;
              });

              tronTransactions.forEach(tx => {
                allTronTransactions.push({
                  hash: tx.transaction_id,
                  network: 'TRC20',
                  from: tx.from,
                  to: tx.to,
                  value: tx.value,
                  tokenDecimal: tx.token_info ? tx.token_info.decimals : 18,
                  timeStamp: tx.block_timestamp ? Math.floor(tx.block_timestamp / 1000) : null,
                  status: '1',
                  confirmed: true
                });
              });

              startToken = altTronResponse.data.meta?.fingerprint;
              hasMoreTronGrid = !!startToken && altTronResponse.data.data.length === 200;
              tronGridAttempts++;
            } else {
              hasMoreTronGrid = false;
            }
          }
        } catch (altError) {
          console.error('Error fetching TRON transactions (alternative method):', altError.message);
        }
      }
      
      // Procesar todas las transacciones TRC20 obtenidas (de Tronscan o TronGrid)
      allTronTransactions.forEach(tx => {
        // Si ya tiene la estructura de TronGrid, agregar directamente
        if (tx.hash && tx.network === 'TRC20') {
          transactions.push(tx);
        } else {
          // Procesar transacciones de Tronscan
          transactions.push({
            hash: tx.hash,
            network: 'TRC20',
            from: tx.from || tx.ownerAddress,
            to: tx.to || TRC20_WALLET,
            value: tx.amount || tx.quant || '0',
            tokenDecimal: tx.tokenInfo ? tx.tokenInfo.decimals : 18,
            timeStamp: tx.timestamp ? Math.floor(tx.timestamp / 1000) : null,
            status: tx.contractRet === 'SUCCESS' ? '1' : '0',
            confirmed: tx.confirmed === true
          });
        }
      });
      
      console.log(`✅ Obtenidas ${allTronTransactions.length} transacciones TRC20`);
    } catch (tronError) {
      console.error('❌ Error fetching TRON transactions:', tronError.message);
      console.error('Error details:', tronError.response?.data || tronError.stack);
    }

    // Ordenar por fecha (más recientes primero)
    transactions.sort((a, b) => {
      const timeA = parseInt(a.timeStamp) || 0;
      const timeB = parseInt(b.timeStamp) || 0;
      return timeB - timeA;
    });

    // Retornar TODAS las transacciones (sin límite)
    console.log(`✅ Total de transacciones obtenidas: ${transactions.length}`);
    console.log(`📊 Desglose: ${transactions.filter(t => t.network === 'BEP20').length} BEP20, ${transactions.filter(t => t.network === 'TRC20').length} TRC20`);
    
    if (transactions.length === 0) {
      console.warn('⚠️ No se obtuvieron transacciones. Verificar conectividad con APIs externas.');
    }
    
    // Si no hay transacciones BEP20 pero hay TRC20, agregar un mensaje informativo
    const bep20Count = transactions.filter(t => t.network === 'BEP20').length;
    const trc20Count = transactions.filter(t => t.network === 'TRC20').length;
    
    if (bep20Count === 0 && trc20Count > 0) {
      console.warn('⚠️ No se obtuvieron transacciones BEP20. BSCScan requiere una API key válida.');
      console.warn('💡 Para obtener una API key gratuita: https://bscscan.com/apis');
      console.warn('💡 Luego configurar: BSCSCAN_API_KEY en variables de entorno o config/default.json');
    }
    
    res.json(transactions);
  } catch (error) {
    console.error('❌ Get wallet transactions error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Error al obtener transacciones de wallets', details: error.message });
  }
}

module.exports = { getTransactions };

