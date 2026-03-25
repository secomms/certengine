function validateGasFee(value){
    const num = Number(value);
        if (Number.isNaN(num) || num < 0) {
            throw new Error('Invalid baseFee');
        }
        return true;
}


module.exports = {
    validateGasFee,
}