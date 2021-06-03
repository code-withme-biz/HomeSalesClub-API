export default async (req: any, res: any) => {

    res.send({
        statusCode: 200,
        body: { 
            resp: `Hello world.`,
            success: true
        }
    });  

}