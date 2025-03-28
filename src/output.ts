import { Action }  from '@itrocks/action'
import { Need }    from '@itrocks/action'
import { NOTHING } from '@itrocks/action'
import { Request } from '@itrocks/action-request'
import { Route }   from '@itrocks/route'

@Need(NOTHING)
@Route('/')
export class Output extends Action
{

	async html(request: Request)
	{
		return this.htmlTemplateResponse(null, request, __dirname + '/output.html')
	}

}
