import chai from 'chai';
import app from '../../src/app.js';
import { setupServerNoLogin } from "./utils/setup.mjs";
import pkg from "./utils/data.js";
import { checkError, checkOk } from "./utils/otherCheckers.mjs";
import { checkCertInfos, checkProofs, checkTicket } from "./utils/certChecker.mjs";
import {getSenderAccount} from "../../src/connectors/blockchainConnector.js";

const { certData, batch } = pkg;

chai.should();
const expect = chai.expect;

let agent;
let print_log = true;

before(async function () {
    this.timeout(10000);
    agent = await setupServerNoLogin(app);
});

let tickets = [];
let proofs, URL, transactionHash, gasPrice;

const owner = "Test Owner";
const user = "test@test.com";
const hashAlgo = 'sha256';
const account = await getSenderAccount()

describe("Certification procedure test", function () {
    if (print_log) {
        console.log("Certification procedure test");
    }

    expect(account.address).to.not.be.undefined;
    expect(account.privateKey).to.not.be.undefined;

    it('Request certification for certData', async function () {
        if (print_log) {
            console.log("Request certification for certData");
        }
        let api = `/api/requestCert`;
        for (let doc of certData) {
            let req = {
                owner: owner,
                user: user,
                data: [doc],
                hashAlgorithm: "sha256"
            };
            let res = await agent.post(api).send(req);
            const ticket = checkOk(res, 200);
            checkTicket(ticket);
            tickets.push(ticket);
            if (print_log) {
                console.log("api: " + api);
                console.log("request: " + JSON.stringify(req));
                console.log("response: " + JSON.stringify(ticket));
            }
        }
    });

    it('Request certification for batch data', async function () {
        if (print_log) {
            console.log("Request certification for batch data");
        }
        let api = `/api/requestCert`;
        let req = {
            owner: owner,
            user: user,
            data: batch,
            hashAlgorithm: "sha256"
        };
        let res = await agent.post(api).send(req);
        const ticket = checkOk(res, 200);
        checkTicket(ticket);
        tickets.push(ticket);

        if (print_log) {
            console.log("api: " + api);
            console.log("request: " + JSON.stringify(req));
            console.log("response: " + JSON.stringify(ticket));
        }
    });

    it('Abort certification for an element of certData', async function () {
        if (print_log) {
            console.log("Abort certification for an element of certData");
        }
        let doc = certData.pop();
        let api = `/api/abortCert`;
        let req = {
            owner: owner,
            id: doc.id,
            ticket: tickets.pop()
        };
        let res = await agent.delete(api).query(req);
        checkOk(res, 200);

        if (print_log) {
            console.log("api: " + api);
            console.log("request: " + JSON.stringify(req));
            console.log("response: empty");
        }
    });

    it('Get gasPrice', async function () {
        if (print_log) {
            console.log("Get gasPrice");
        }
        this.timeout(10000000);
        let api = `/api/getGasPrice`;
        let req = {
            address: account.address,
        };
        let res = await agent.get(api).query(req);
        gasPrice = checkOk(res, 200);

        if (print_log) {
            console.log("api: " + api);
            console.log("request: " + JSON.stringify(req));
            console.log("response: " + JSON.stringify(gasPrice));
        }
    });

    it('Certify all data', async function () {
        if (print_log) {
            console.log("Certify all data");
        }
        this.timeout(10000000);
        expect(tickets.length).to.be.above(0);

        let api = `/api/certify`;
        let req = {
            owner: owner,
            user: user,
            account: account,
            ticket: tickets[0],
            gasPrice: {
                baseFee: gasPrice.baseFee,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
                maxFeePerGas: gasPrice.maxFeePerGas
            }
        };

        let res = await agent.post(api).send(req);
        const certInfos = checkOk(res, 200);
        checkCertInfos(certInfos);

        if (print_log) {
            console.log("api: " + api);
            console.log("request: " + JSON.stringify(req));
            console.log("response: " + JSON.stringify(certInfos));
        }
    });

    it('Obtain proofs for certified data', async function () {
        if (print_log) {
            console.log("Obtain proofs for certified data");
        }
        expect(tickets.length).to.be.above(0);
        let api1 = `/api/downloadCert`;
        let req1 = {
            owner: owner,
            ticket: tickets[0]
        };
        let res1 = await agent.get(api1).query(req1);
        const certInfos = checkOk(res1, 200);
        checkProofs(certInfos, hashAlgo);
        URL = certInfos.blockchainURL;
        proofs = certInfos.proofs;
        transactionHash = certInfos.transactionHash;

        let api2 = `/api/ackDownload`;
        let req2 = {
            owner: owner,
            ticket: tickets[0]
        };
        let res2 = await agent.delete(api2).query(req2);
        checkOk(res2, 200);

        if (print_log) {
            console.log("api1: " + api1);
            console.log("request 1: " + JSON.stringify(req1));
            console.log("response 1: " + JSON.stringify(certInfos));
            console.log("api2: " + api2);
            console.log("request 2: " + JSON.stringify(req2));
            console.log("response 2: empty");
        }
    });

    it('Certification queue should not exist after certification download', async function () {
        if (print_log) {
            console.log("Certification queue should not exist after certification download");
        }
        expect(tickets.length).to.be.above(0);
        let api = `/api/downloadCert`;
        let req = {
            owner: owner,
            ticket: tickets[0]
        };
        let res = await agent.get(api).query(req);

        if (print_log) {
            console.log("api: " + api);
            console.log("request: " + JSON.stringify(req));
            console.log("response: error 404");
        }
        checkError(res, 404);
    });

    it('Verification of correct certified data should be valid', async function () {
        if (print_log) {
            console.log("Verification of correct certified data should be valid");
        }
        this.timeout(10000000);
        expect(proofs.length).to.be.above(0);
        expect(typeof transactionHash).to.equal('string');
        expect(typeof URL).to.equal('string');

        for (let i = 0; i < proofs.length; i++) {
            let p = proofs[i].proof;
            let dataID = proofs[i].id;
            let idx = certData.findIndex(c => c.id === dataID);
            let data = idx !== -1 ? certData[idx] : batch[batch.findIndex(c => c.id === dataID)];

            let api = `/api/verify`;
            let req = {
                proof: p,
                transactionHash: transactionHash,
                data: data.toBeCertified,
                blockchainURL: URL,
                hashAlgorithm: hashAlgo
            };
            let res = await agent.post(api).send(req);
            const certInfos = checkOk(res, 200);
            expect(certInfos.valid).to.equal(true);

            if (i === 0 && print_log) {
                console.log("api: " + api);
                console.log("request: " + JSON.stringify(req));
                console.log("response: " + JSON.stringify(certInfos));
            }
        }
    });

    it('Verification of tampered certified data should be not valid', async function () {
        if (print_log) {
            console.log("Verification of tampered certified data should be not valid");
        }
        this.timeout(10000000);
        let api = `/api/verify`;

        for (let i = 1; i < proofs.length; i++) {
            let req = {
                proof: proofs[i].proof,
                transactionHash: transactionHash,
                data: certData[0].toBeCertified,
                blockchainURL: URL,
                hashAlgorithm: hashAlgo
            };
            let res = await agent.post(api).send(req);
            const certInfos = checkOk(res, 200);
            expect(certInfos.valid).to.equal(false);

            if (i === 1 && print_log) {
                console.log("api: " + api);
                console.log("request: " + JSON.stringify(req));
                console.log("response: " + JSON.stringify(certInfos));
            }
        }
    });

    it('If requesting certification for multiple data, the hashing algorithm must always be the same', async function () {
        if (print_log) {
            console.log("If requesting certification for multiple data, the hashing algorithm must always be the same");
        }
        let api = `/api/requestCert`;

        let req1 = {
            owner: owner,
            user: user,
            data: [certData[0]],
            hashAlgorithm: "sha256"
        };

        let req2 = {
            owner: owner,
            user: user,
            data: [certData[1]],
            hashAlgorithm: "sha512"
        };

        let res = await agent.post(api).send(req1);
        const t = checkOk(res, 200);

        let res2 = await agent.post(api).send(req2);
        checkError(res2, 400);

        await agent.delete(`/api/abortCert`).query({
            owner: owner,
            id: certData[0].id,
            ticket: t
        });

        if (print_log) {
            console.log("api1: " + api);
            console.log("request1: " + JSON.stringify(req1));
            console.log("response1: empty");
            console.log("api2: " + api);
            console.log("response 2: error 400");
        }
    });
});