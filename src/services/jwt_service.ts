
const jsonwebtoken = require('jsonwebtoken')
const bcrypt = require('bcrypt')

export const createToken = (email: String, password: String): String => {
  return jsonwebtoken.sign(
    { email: email, password: password },
    process.env.jwt_secret,
    { expiresIn: '1d' }
  );
}

export const verifyToken = (token: String) => {
  return new Promise(resolve => {
      jsonwebtoken.verify(token, process.env.jwt_secret, (err: any, usr: any) => {
          if (err)
              resolve({valid: false, err});
          else
              resolve({valid: true, err});
      });

  })
}