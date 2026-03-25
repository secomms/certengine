import chai from "chai";
const expect = chai.expect;

export function checkError(res, code, nOfErrors) {
    expect(res.status).to.equal(code);
    expect(typeof res.body.data).to.equal("undefined");
    if (nOfErrors) {
        expect(res.body.error.length).to.be.equal(nOfErrors);
    }
}

export function multiErrorCheck(res, codes) {
    expect(codes.includes(res.status)).to.be.equal(true);
    expect(typeof res.body.data).to.equal("undefined");
    expect(res.body.error.length).to.be.above(0);
}

export function checkOk(res, code) {
    expect(res.status).to.equal(code);
    return res.body.data.result;
}