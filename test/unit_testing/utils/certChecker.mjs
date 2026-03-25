import chai from "chai";
const expect = chai.expect;

export function checkTicket(ticket) {
    expect(typeof ticket).to.equal('string');
}

export function checkCertInfos(certInfos) {
    expect(typeof certInfos).to.equal('object');
    expect(typeof certInfos.blockchainName).to.equal('string');
    expect(typeof certInfos.blockchainURL).to.equal('string');
    expect(certInfos.transactionHash.startsWith('0x')).to.be.true;
    expect(certInfos.transactionTimestamp).to.not.be.undefined;
    expect(typeof certInfos.userID).is.oneOf(['string', 'undefined']);
}

export function checkProofs(certProofs, hashAlgo) {
    expect(typeof certProofs).to.equal('object');
    expect(Array.isArray(certProofs.proofs)).to.equal(true);
    for (let elem of certProofs.proofs) {
        expect(typeof elem.id).to.equal('string');
        expect(Array.isArray(elem.proof)).to.equal(true);
    }
    expect(certProofs.hashAlgo).to.equal(hashAlgo);
    checkCertInfos(certProofs);
}