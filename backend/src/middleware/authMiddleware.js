const jwt = require("jsonwebtoken");
const { CLIENT_AUTH_RESPONSES, logAuthFailure } = require("../utils/authErrors");

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader) {
        const { status, body } = CLIENT_AUTH_RESPONSES.tokenRequired;
        return res.status(status).json(body);
    }

    // A missing server secret is a server configuration failure, never an
    // invalid client token: answer 500 instead of a misleading 403. This
    // also covers importing app.js independently of server.js, whose
    // startup check cannot run in that case.
    if(!process.env.JWT_SECRET) {
        logAuthFailure("authMiddleware", "token", null);
        const { status, body } = CLIENT_AUTH_RESPONSES.internal;
        return res.status(status).json(body);
    }

    //extract the actual jwt from bearer <token>
    const token = authHeader.split(" ")[1];

    //verify the token was created by our server
    jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
        if(error) {
            const { status, body } = CLIENT_AUTH_RESPONSES.tokenInvalid;
            return res.status(status).json(body);
        }

        //store the verifed user info on the request
        req.user = user;
        //continue to the next middleware or route
        next();
    });
}

module.exports = authenticateToken;
