import {Elysia} from "elysia"
import { db } from "../../lib/superbase.ts";


export const auth = new Elysia({name: 'auth'})
	.derive({as: 'global'}, async ({request, set}) => {
		const authHeader = request.headers.get('authorization')

		if(!authHeader || !authHeader.startsWith("Bearer")) {
			set.status = 401;
			return {error: "Missing authorization header"}
		}

		const token = authHeader.split(' ')[1]
		const {data: {user}, error} = await db.auth.getUser(token)

		if(!user || error) {
			set.status = 401;
			return {error : "Unauthorized Access denied"}
		}

		return {user}
	})