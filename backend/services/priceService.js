const axios = require('axios');

class PriceService {
  constructor() {
    this.cache = {
      price: null,
      timestamp: null,
      cacheSeconds: 30
    };
  }

  async getUSDTPriceInARS() {
    try {
      const now = Date.now();
      
      // Check cache
      if (this.cache.price && this.cache.timestamp) {
        const cacheAge = (now - this.cache.timestamp) / 1000;
        if (cacheAge < this.cache.cacheSeconds) {
          return this.cache.price;
        }
      }

      // Fetch from CoinGecko
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=ars',
        { timeout: 5000 }
      );

      const price = parseFloat(response.data.tether.ars);
      
      if (price && price > 0) {
        this.cache.price = price;
        this.cache.timestamp = now;
        return price;
      }

      throw new Error('Invalid price response');
    } catch (error) {
      console.error('Error fetching price:', error.message);
      
      // Return cached price if available, even if expired
      if (this.cache.price) {
        console.log('Using cached price due to API error');
        return this.cache.price;
      }

      // Fallback price if no cache
      return 1000; // Default fallback
    }
  }

  async convertARSToUSDT(arsAmount) {
    const price = await this.getUSDTPriceInARS();
    
    // Validate price is reasonable (should be around 1000-2000 ARS per USDT)
    if (price < 100 || price > 5000) {
      console.error(`[ERROR] Invalid USDT price detected: ${price} ARS. Using fallback.`);
      // Use fallback price of 1450 ARS
      return arsAmount / 1450;
    }
    
    const result = arsAmount / price;
    console.log(`[DEBUG convertARSToUSDT] ARS: ${arsAmount}, Price: ${price} ARS/USDT, Result: ${result} USDT`);
    return result;
  }

  async convertUSDTToARS(usdtAmount) {
    const price = await this.getUSDTPriceInARS();
    return usdtAmount * price;
  }

  setCacheSeconds(seconds) {
    this.cache.cacheSeconds = seconds;
  }
}

module.exports = new PriceService();

