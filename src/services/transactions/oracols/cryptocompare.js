const {configurator} = require("../../../config");
const axios = require("axios");

/**
 *
 * @return {Promise<{ eur: number | undefined, status: boolean }>}
 */
async function getEthEurFromCryptocompare(){
    let eur, status;
    const api_key = await configurator.getConfig('blockchain.cryptocompareKey')
    await axios
        .get(`https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=EUR&api_key=${api_key}`)
        .then(function (response) {
            eur = response.data['EUR'];
            status = eur !== undefined;
        });
    return {eur:eur, status:status}
}

module.exports = {
    getEthEurFromCryptocompare,
}